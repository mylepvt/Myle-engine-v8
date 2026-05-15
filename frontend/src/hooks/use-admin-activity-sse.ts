/**
 * useAdminActivitySSE — replaces Socket.IO CRM hook with FastAPI SSE stream.
 *
 * Connects to GET /api/v1/admin/activity-stream (EventSource).
 * Maps backend observation events → AdminActivityEntry for the feed store.
 * Auto-reconnects on error. Pauses when tab is hidden.
 */

import { useEffect, useRef } from 'react'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

const REST_URL = '/api/v1/admin/activity-feed?limit=50'

const SSE_URL = '/api/v1/admin/activity-stream'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30_000

// Map backend event_type → severity
function severityFor(eventType: string): AdminActivityEntry['severity'] {
  if (eventType.includes('failure') || eventType.includes('error')) return 'error'
  if (eventType.includes('warn') || eventType.includes('reject')) return 'warning'
  return 'info'
}

// Map backend event payload → human description
function describeEvent(eventType: string, payload: Record<string, unknown>): string {
  const leadId = payload.lead_id ?? payload.leadId
  const stage = payload.fastapi_stage ?? payload.stage
  const crmStage = payload.crm_stage

  switch (true) {
    case eventType === 'lead_state' && !!stage:
      return `Lead #${leadId} → ${stage}${crmStage && crmStage !== stage ? ` (CRM: ${crmStage})` : ''}`
    case eventType === 'shadow_delivery':
      return `Shadow sync delivered for lead #${leadId}`
    case eventType.startsWith('scheduler.'):
      return `Scheduler: ${eventType.replace('scheduler.', '').replace(/_/g, ' ')}`
    case eventType.startsWith('wallet.'):
      return `Wallet: ${eventType.replace('wallet.', '').replace(/_/g, ' ')}${leadId ? ` (Lead #${leadId})` : ''}`
    case eventType.startsWith('enrollment.'):
      return `Enrollment: ${eventType.replace('enrollment.', '').replace(/_/g, ' ')}${leadId ? ` (Lead #${leadId})` : ''}`
    default:
      return `${eventType.replace(/[._]/g, ' ')}${leadId ? ` — Lead #${leadId}` : ''}`
  }
}

// Parse an already-parsed event object → AdminActivityEntry (shared by SSE + REST)
function parseEventFromObj(data: Record<string, unknown>): AdminActivityEntry | null {
  try {
    const eventType = (data.event_type ?? data.metric ?? 'unknown') as string
    const leadId = data.lead_id ?? data.leadId
    const actorId = data.actor_id ?? data.user_id
    const payload = (data.payload as Record<string, unknown>) ?? data

    const id = `${eventType}-${leadId ?? 'sys'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    return {
      id,
      action: eventType,
      actorId: actorId ? String(actorId) : undefined,
      targetId: leadId ? String(leadId) : undefined,
      targetType: leadId ? 'lead' : undefined,
      description: describeEvent(eventType, { ...payload, lead_id: leadId }),
      severity: severityFor(eventType),
      timestamp: data.created_at ? new Date(data.created_at as string).getTime() : Date.now(),
      metadata: payload,
    }
  } catch {
    return null
  }
}

// Parse raw SSE data string → AdminActivityEntry
function parseEvent(raw: string): AdminActivityEntry | null {
  try {
    return parseEventFromObj(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return null
  }
}

export function useAdminActivitySSE(enabled: boolean) {
  const pushEntry = useAdminFeedStore((s) => s.pushEntry)
  const setInitialEntries = useAdminFeedStore((s) => s.setInitialEntries)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return

    // Initial load from REST endpoint (populates panel before any live SSE event)
    fetch(REST_URL, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        const events = (data?.events ?? []) as Array<Record<string, unknown>>
        // REST returns newest-first; reverse so oldest is prepended last (panel shows newest at top)
        const initial = [...events].reverse()
          .map(parseEventFromObj)
          .filter((e): e is AdminActivityEntry => e !== null)
        setInitialEntries(initial)
      })
      .catch(() => {
        if (mountedRef.current) setInitialEntries([])
      })

    function connect() {
      if (!mountedRef.current) return
      if (document.visibilityState === 'hidden') return
      if (typeof EventSource === 'undefined') return   // jsdom / SSR guard

      const es = new EventSource(SSE_URL, { withCredentials: true })
      esRef.current = es

      es.onmessage = (e) => {
        // Ignore heartbeat comments
        if (!e.data || e.data.trim() === '') return
        const entry = parseEvent(e.data)
        if (entry) pushEntry(entry)
        // Reset backoff on success
        reconnectDelayRef.current = RECONNECT_DELAY_MS
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        if (!mountedRef.current) return
        // Exponential backoff reconnect
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    }

    // Pause/resume on tab visibility
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          connect()
        }
      } else {
        esRef.current?.close()
        esRef.current = null
      }
    }

    connect()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current ?? undefined)
      esRef.current?.close()
      esRef.current = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, pushEntry, setInitialEntries])
}
