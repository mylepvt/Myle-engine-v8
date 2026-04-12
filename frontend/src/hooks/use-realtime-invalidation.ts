import { useEffect, useRef } from 'react'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { apiBase } from '@/lib/api'
import { isLowEndDevice } from '@/lib/device-performance'

type InvalidateMsg = { v: number; type: 'invalidate'; topics: string[] }

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
  }
  if (t.has('follow_ups')) {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] })
  }
  if (t.has('team')) {
    void qc.invalidateQueries({ queryKey: ['team'] })
  }
  if (t.has('wallet')) {
    void qc.invalidateQueries({ queryKey: ['wallet'] })
  }
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
    const reconnectMs = isLowEndDevice() ? 8_000 : 3_000

    const scheduleTopics = (topics: string[]) => {
      if (!isLowEndDevice()) {
        applyTopics(qc, topics)
        return
      }
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined
        applyTopics(qc, topics)
      }, 450)
    }

    const connect = () => {
      const url = buildWsUrl()
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(String(ev.data)) as InvalidateMsg
          if (raw?.type === 'invalidate' && Array.isArray(raw.topics)) {
            scheduleTopics(raw.topics)
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        if (closed) return
        reconnectTimer = window.setTimeout(connect, reconnectMs)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [enabled, qc])
}
