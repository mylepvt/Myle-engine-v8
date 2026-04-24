import { useEffect, useRef } from 'react'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { apiBase } from '@/lib/api'
import { isLowEndDevice } from '@/lib/device-performance'
import {
  clearScrollGatePolling,
  flushRealtimeTopicsOrDefer,
} from '@/lib/main-scroll-gate'
import { mergeTopicBatches } from '@/lib/merge-topic-batches'
import {
  applyTeamTrackingPresenceEvent,
  type TeamTrackingPresenceEvent,
} from '@/hooks/use-team-tracking-query'

type InvalidateMsg = { v: number; type: 'invalidate'; topics: string[] }
type RealtimeMsg = InvalidateMsg | TeamTrackingPresenceEvent
type PresenceAction = 'ping' | 'idle' | 'resume'

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
    void qc.invalidateQueries({ queryKey: ['team', 'tracking'] })
  }
  if (t.has('follow_ups')) {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] })
    void qc.invalidateQueries({ queryKey: ['team', 'tracking'] })
  }
  if (t.has('team')) {
    void qc.invalidateQueries({ queryKey: ['team'] })
  }
  if (t.has('team_tracking') || t.has('team_tracking.presence')) {
    void qc.invalidateQueries({ queryKey: ['team', 'tracking'] })
  }
  if (t.has('wallet')) {
    void qc.invalidateQueries({ queryKey: ['wallet'] })
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

    const connect = () => {
      const url = buildWsUrl()
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        sendPresence(document.visibilityState === 'hidden' ? 'idle' : 'resume')
        startHeartbeat()
      }

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(String(ev.data)) as RealtimeMsg
          if (
            raw?.type === 'team_tracking.presence' &&
            typeof raw.user_id === 'number' &&
            typeof raw.last_seen_at === 'string'
          ) {
            applyTeamTrackingPresenceEvent(qc, raw)
            return
          }
          if (raw?.type === 'invalidate' && Array.isArray(raw.topics)) {
            scheduleTopics(raw.topics)
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        clearHeartbeat()
        if (closed) return
        reconnectTimer = window.setTimeout(connect, reconnectMs)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    const onVisibilityChange = () => {
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
