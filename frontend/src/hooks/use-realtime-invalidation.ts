import { useEffect, useRef } from 'react'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { apiBase, silentAuthRefresh } from '@/lib/api'
import { isLowEndDevice } from '@/lib/device-performance'
import {
  clearScrollGatePolling,
  flushRealtimeTopicsOrDefer,
} from '@/lib/main-scroll-gate'
import { mergeTopicBatches } from '@/lib/merge-topic-batches'

type InvalidateMsg = { v: number; type: 'invalidate'; topics: string[] }
type RealtimeMsg = InvalidateMsg
type PresenceAction = 'ping' | 'idle' | 'resume'

/** Server closes with this when the access cookie is missing/expired (see realtime_ws.py). */
const WS_CLOSE_AUTH_REQUIRED = 4401
const MAX_RECONNECT_MS = 60_000

function buildWsUrl(): string {
  const path = '/api/v1/ws'
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const base = apiBase.replace(/\/$/, '')
  if (base === '') {
    return `${proto}://${host}${path}`
  }
  try {
    const u = new URL(base.startsWith('http') ? base : `https://${base}`)
    const p = u.protocol === 'https:' ? 'wss' : 'ws'
    return `${p}://${u.host}${path}`
  } catch {
    return `${proto}://${host}${path}`
  }
}

function applyTopics(qc: QueryClient, topics: string[]) {
  const t = new Set(topics)
  if (t.has('all')) {
    void qc.invalidateQueries()
    return
  }
  if (t.has('leads')) {
    void qc.invalidateQueries({ queryKey: ['leads'] })
    void qc.invalidateQueries({ queryKey: ['workboard'] })
    void qc.invalidateQueries({ queryKey: ['lead-pool'] })
    void qc.invalidateQueries({ queryKey: ['retarget'] })
    void qc.invalidateQueries({ queryKey: ['meta', 'bootstrap'] })
    void qc.invalidateQueries({ queryKey: ['api-meta'] })
    void qc.invalidateQueries({ queryKey: ['hello'] })
    void qc.invalidateQueries({ queryKey: ['shell-stub'] })
    void qc.invalidateQueries({ queryKey: ['analytics'] })
    void qc.invalidateQueries({ queryKey: ['system'] })
    void qc.invalidateQueries({ queryKey: ['execution'] })
  }
  if (t.has('follow_ups')) {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] })
  }
  if (t.has('team')) {
    void qc.invalidateQueries({ queryKey: ['team'] })
    void qc.invalidateQueries({ queryKey: ['team', 'flp-min-billing-requests'] })
  }
  if (t.has('team_tracking') || t.has('team_tracking.presence')) {
    void qc.invalidateQueries({ queryKey: ['admin', 'leader-health'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'online-now'] })
    void qc.invalidateQueries({ queryKey: ['admin', 'today-pulse'] })
  }
  if (t.has('wallet')) {
    void qc.invalidateQueries({ queryKey: ['wallet'] })
  }
  if (t.has('enroll')) {
    void qc.invalidateQueries({ queryKey: ['enroll'] })
  }
  if (t.has('whatsapp_log')) {
    void qc.invalidateQueries({ queryKey: ['whatsapp', 'logs'] })
  }
}

function isImmediateTrackingTopic(topics: string[]) {
  return topics.some((topic) => topic === 'team_tracking' || topic === 'team_tracking.presence')
}

/** Subscribes to ``wss://…/api/v1/ws`` (cookie auth) and invalidates TanStack Query caches on server pushes. */
export function useRealtimeInvalidation(enabled: boolean) {
  const qc = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    let closed = false
    let reconnectTimer: number | undefined
    let debounceTimer: number | undefined
    let heartbeatTimer: number | undefined
    const lowEndPending: string[][] = []
    const reconnectMs = isLowEndDevice() ? 8_000 : 3_000
    const heartbeatMs = isLowEndDevice() ? 25_000 : 20_000

    const sendPresence = (action: PresenceAction) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(
        JSON.stringify({
          action,
          path: window.location.pathname,
        }),
      )
    }

    const clearHeartbeat = () => {
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
      }
    }

    const startHeartbeat = () => {
      clearHeartbeat()
      heartbeatTimer = window.setInterval(() => {
        sendPresence(document.visibilityState === 'hidden' ? 'idle' : 'ping')
      }, heartbeatMs)
    }

    const scheduleTopics = (topics: string[]) => {
      if (isImmediateTrackingTopic(topics)) {
        applyTopics(qc, topics)
        return
      }
      const deliver = (merged: string[]) => {
        if (!isLowEndDevice()) {
          applyTopics(qc, merged)
          return
        }
        lowEndPending.push(merged)
        if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(() => {
          debounceTimer = undefined
          const batch = mergeTopicBatches(lowEndPending)
          lowEndPending.length = 0
          applyTopics(qc, batch)
        }, 450)
      }
      flushRealtimeTopicsOrDefer(topics, deliver)
    }

    let failedAttempts = 0
    const scheduleReconnect = () => {
      // Exponential backoff so a dead session / outage is not hammered every few seconds.
      const delay = Math.min(reconnectMs * 2 ** failedAttempts, MAX_RECONNECT_MS)
      failedAttempts += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, delay)
    }

    const connect = () => {
      const url = buildWsUrl()
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        failedAttempts = 0
        sendPresence(document.visibilityState === 'hidden' ? 'idle' : 'resume')
        startHeartbeat()
      }

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(String(ev.data)) as RealtimeMsg
          if (raw?.type === 'invalidate' && Array.isArray(raw.topics)) {
            scheduleTopics(raw.topics)
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onclose = (ev) => {
        wsRef.current = null
        clearHeartbeat()
        if (closed) return
        if (ev.code === WS_CLOSE_AUTH_REQUIRED) {
          // Access cookie expired (e.g. app idle in background): refresh it like
          // REST calls do, then reconnect. A rejected refresh means the session
          // is over — stop retrying; the next API call routes to login.
          void silentAuthRefresh().then((ok) => {
            if (closed || ok === false) return
            scheduleReconnect()
          })
          return
        }
        scheduleReconnect()
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wsRef.current && reconnectTimer !== undefined) {
        // Back in the foreground while waiting out a backoff: reconnect now.
        window.clearTimeout(reconnectTimer)
        reconnectTimer = undefined
        failedAttempts = 0
        connect()
        return
      }
      sendPresence(document.visibilityState === 'hidden' ? 'idle' : 'resume')
    }
    const onFocus = () => sendPresence('resume')
    const onPageHide = () => sendPresence('idle')

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)

    connect()

    return () => {
      closed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
      clearHeartbeat()
      lowEndPending.length = 0
      clearScrollGatePolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [enabled, qc])
}
