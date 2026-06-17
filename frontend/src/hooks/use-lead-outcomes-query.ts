import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface OutcomeSummary {
  total: number
  outcomes: Record<string, number>
  active_pct: number
  converted_pct: number
  dead_pct: number
  recycle_pct: number
}

export interface DeadReasonMember {
  user_id: number
  name: string
  total_dead: number
  reasons: Record<string, number>
}

export interface ZombieLead {
  id: number
  name: string
  status: string
  assigned_to_name: string | null
  assigned_to_user_id: number | null
  created_at: string | null
  last_action_at: string | null
  days_inactive: number | null
}

export interface RecycleLead {
  id: number
  name: string
  status: string
  recycle_reason: string | null
  assigned_to_name: string | null
  assigned_to_user_id: number | null
  outcome_changed_at: string | null
  days_in_recycle: number | null
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useOutcomeSummary(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'lead-outcomes', 'summary'],
    queryFn: () => fetchJson<OutcomeSummary>('/api/v1/admin/lead-outcomes/summary'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useDeadReasons(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'lead-outcomes', 'dead-reasons'],
    queryFn: () => fetchJson<{ members: DeadReasonMember[] }>('/api/v1/admin/lead-outcomes/dead-reasons'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useZombieLeads(enabled = true, inactiveDays = 7) {
  return useQuery({
    queryKey: ['admin', 'lead-outcomes', 'zombie', inactiveDays],
    queryFn: () => fetchJson<{ leads: ZombieLead[] }>(`/api/v1/admin/lead-outcomes/zombie?inactive_days=${inactiveDays}`),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useRecycleLeads(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'lead-outcomes', 'recycle'],
    queryFn: () => fetchJson<{ leads: RecycleLead[] }>('/api/v1/admin/lead-outcomes/recycle'),
    enabled,
  })
}
