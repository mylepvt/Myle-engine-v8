/**
 * useAdminActivitySSE — replaces Socket.IO CRM hook with FastAPI SSE stream.
 *
 * Connects to GET /api/v1/admin/activity-stream (EventSource).
 * Maps backend observation events → AdminActivityEntry for the feed store.
 * Auto-reconnects on error. Pauses when tab is hidden.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'
import { playAppSound } from '@/lib/app-sounds'

const REST_URL = '/api/v1/admin/activity-feed?limit=50'

const SSE_URL = '/api/v1/admin/activity-stream'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30_000

// Map backend event_type → severity
function severityFor(eventType: string): AdminActivityEntry['severity'] {
  if (eventType.includes('failure') || eventType.includes('error') || eventType.includes('failed')) return 'error'
  if (eventType.includes('warn') || eventType.includes('reject') || eventType.includes('duplicate')) return 'warning'
  return 'info'
}

// Map raw stage keys → human labels
const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  day1: 'Day 1',
  day2: 'Day 2',
  day3: 'Day 3',
  day4: 'Day 4',
  day5: 'Day 5',
  day6: 'Day 6',
  day1_pending: 'Day 1 Pending',
  day1_attended: 'Day 1 Attended',
  day2_pending: 'Day 2 Pending',
  day2_attended: 'Day 2 Attended',
  day3_pending: 'Day 3 Pending',
  day3_attended: 'Day 3 Attended',
  interview: 'Interview',
  enrolled: 'Min. FLP Billed',
  closed: 'Closed',
  rejected: 'Rejected',
  pool: 'In Pool',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  archive: 'Archived',
  archived: 'Archived',
  lost: 'Lost',
  retarget: 'Retarget',
  follow_up: 'Follow Up',
  converted: 'Converted',
}

function stageLabel(stage: unknown): string {
  if (!stage) return ''
  const s = String(stage)
  return STAGE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Map backend event payload → human description
function describeEvent(eventType: string, payload: Record<string, unknown>): string {
  const leadId = payload.lead_id ?? payload.leadId
  const leadName = (payload.lead_name as string | undefined) || ''
  const leadRef = leadName ? leadName : leadId ? `Lead #${leadId}` : ''
  const stage = payload.fastapi_stage ?? payload.stage

  switch (true) {
    // commit_boundary = SQLAlchemy after-commit hook fires on every lead DB write
    case eventType === 'commit_boundary':
      if (stage) return `${leadRef || 'Lead'} → ${stageLabel(stage)}`
      return leadRef ? `${leadRef} updated` : 'Lead updated'

    case eventType === 'lead:created':
      return leadRef ? `New lead added: ${leadRef}` : 'New lead added'

    case eventType === 'lead:transitioned' || eventType === 'lead_state':
      if (stage) return `${leadRef || 'Lead'} moved to ${stageLabel(stage)}`
      return leadRef ? `${leadRef} status updated` : 'Lead status updated'

    case eventType === 'lead:assigned':
      return leadRef ? `${leadRef} assigned to team` : 'Lead assigned'

    case eventType === 'lead:auto_reassigned':
      return leadRef ? `${leadRef} auto-reassigned` : 'Lead auto-reassigned'

    case eventType === 'lead:claimed' || eventType === 'lead:batch_claimed':
      return leadRef ? `${leadRef} claimed` : 'Lead claimed'

    case eventType === 'lead:claim_duplicate':
      return leadRef ? `Duplicate claim attempt: ${leadRef}` : 'Duplicate claim attempt'

    case eventType === 'lead:closed':
      return leadRef ? `${leadRef} closed` : 'Lead closed'

    case eventType === 'lead:shadow_created' || eventType === 'lead:shadow_synced':
      return leadRef ? `${leadRef} data saved` : 'Lead data saved'

    case eventType === 'lead:shadow_deleted':
      return leadRef ? `${leadRef} data removed` : 'Lead data removed'

    case eventType === 'shadow_delivery':
      return leadRef ? `${leadRef} data updated` : 'Lead data updated'

    case eventType === 'LEAD_UPSERT':
      return leadRef ? `${leadRef} data saved` : 'Lead data saved'

    case eventType === 'LEAD_DELETE':
      return leadRef ? `${leadRef} data removed` : 'Lead data removed'

    case eventType === 'wallet:credited' || eventType === 'wallet:credited_worker':
      return leadRef ? `Wallet credited for ${leadRef}` : 'Wallet credited'

    case eventType === 'performance:recomputed':
      return 'Performance scores updated'

    case eventType === 'system:ranking_recalc':
      return 'Team ranking recalculated'

    case eventType === 'system:scheduler_tick':
      return 'Scheduler ran'

    case eventType === 'fsm:validation_failed':
      return leadRef ? `Stage change blocked for ${leadRef}` : 'Stage change blocked'

    case eventType === 'scheduler.watch_archive':
      return 'Auto cleanup ran'

    case eventType === 'scheduler.failure':
      return 'Auto task failed'

    case eventType === 'scheduler.leader_enforcement':
      return 'Team leader check ran'

    case eventType.startsWith('scheduler.'):
      return 'Auto task ran'

    case eventType === 'wallet.adjustment':
      return leadRef ? `Points adjusted for ${leadRef}` : 'Points adjusted'

    case eventType === 'wallet.recharge_review':
      return leadRef ? `Payment review for ${leadRef}` : 'Payment under review'

    case eventType.startsWith('wallet.'):
      return leadRef ? `Points updated for ${leadRef}` : 'Points updated'

    case eventType === 'enrollment.link_generated':
      return leadRef ? `Join link created for ${leadRef}` : 'Join link created'

    case eventType.startsWith('enrollment.'):
      return leadRef ? `Min. FLP Billing update for ${leadRef}` : 'Min. FLP Billing updated'

    default:
      // Fallback: clean up any remaining snake_case / dots
      return `${eventType.replace(/[._:]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}${leadRef ? ` — ${leadRef}` : ''}`
  }
}

// Parse an already-parsed event object → AdminActivityEntry (shared by SSE + REST)
function parseEventFromObj(data: Record<string, unknown>): AdminActivityEntry | null {
  try {
    const eventType = (data.event_type ?? data.metric ?? 'unknown') as string
    const leadId = data.lead_id ?? data.leadId
    const actorId = data.actor_id ?? data.user_id
    const payload = (data.payload as Record<string, unknown>) ?? data

    // actor_name may live at top-level OR inside payload (depends on call path)
    const actorName = (data.actor_name ?? payload.actor_name ?? '') as string

    const id = `${eventType}-${leadId ?? 'sys'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    return {
      id,
      action: eventType,
      actorId: actorId ? String(actorId) : undefined,
      actorName: actorName || undefined,
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

// ── Activity sounds ──────────────────────────────────────────────────────────
function activitySound(action: string) {
  if (action === 'lead:created') playAppSound('notify')
  else if (action === 'lead:transitioned' || action === 'lead_state') playAppSound('notify')
  else if (action === 'lead:closed') playAppSound('claim')
  else if (action === 'lead:claimed' || action === 'lead:batch_claimed') playAppSound('claim')
  else if (action.startsWith('wallet:')) playAppSound('success')
  else if (action === 'enrollment.link_generated') playAppSound('notify')
  else if (action === 'lead:assigned') playAppSound('notify')
  else if (action.includes('failure') || action.includes('duplicate')) playAppSound('error')
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
  const setRefreshFn = useAdminFeedStore((s) => s.setRefreshFn)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS)
  const mountedRef = useRef(true)
  const connectRef = useRef<(() => void) | null>(null)

  const fetchRest = useCallback((replace = false) => {
    fetch(REST_URL, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        const events = (data?.events ?? []) as Array<Record<string, unknown>>
        // REST returns newest-first — keep as-is so index 0 = newest (panel renders top-down)
        const initial = events
          .map(parseEventFromObj)
          .filter((e): e is AdminActivityEntry => e !== null)
        setInitialEntries(initial, replace)
      })
      .catch(() => {
        if (mountedRef.current && replace) setInitialEntries([], true)
      })
  }, [setInitialEntries])

  const refresh = useCallback(() => {
    // Re-fetch latest from REST — explicit user action, replace stale list
    fetchRest(true)
    // Reconnect SSE with reset backoff
    esRef.current?.close()
    esRef.current = null
    clearTimeout(reconnectTimerRef.current ?? undefined)
    reconnectDelayRef.current = RECONNECT_DELAY_MS
    connectRef.current?.()
  }, [fetchRest])

  useEffect(() => {
    setRefreshFn(refresh)
  }, [refresh, setRefreshFn])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return

    fetchRest()

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
        if (entry) {
          pushEntry(entry)
          activitySound(entry.action)
          useLiveDashboardStore.getState().processEvent(entry.action, entry.metadata)
          useFunnelActivityStore.getState().processAction(
            entry.actorId ?? entry.targetId ?? '',
            entry.actorName ?? 'Unknown',
            entry.action,
            String(entry.metadata?.stage ?? entry.metadata?.fastapi_stage ?? ''),
          )
        }
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

    connectRef.current = connect

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
  }, [enabled, pushEntry, fetchRest])
}
