import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamTrackingMemberSummary = {
  user_id: number
  member_name: string
  member_username: string | null
  member_email: string
  member_phone: string | null
  member_fbo_id: string
  member_role: string
  upline_name: string | null
  upline_fbo_id: string | null
  leader_user_id: number | null
  leader_name: string | null
  presence_status: 'online' | 'idle' | 'offline'
  last_seen_at: string | null
  last_activity_at: string | null
  login_count: number
  calls_count: number
  leads_added_count: number
  followups_done_count: number
  consistency_score: number
  consistency_band: 'low' | 'medium' | 'high'
  insights: string[]
}

export type TeamTrackingOverviewResponse = {
  items: TeamTrackingMemberSummary[]
  total: number
  scope_total_members: number
  online_count: number
  idle_count: number
  offline_count: number
  average_score: number
  date: string
  timezone: string
  note: string | null
}

export type TeamTrackingTrendPoint = {
  date: string
  login_count: number
  calls_count: number
  leads_added_count: number
  followups_done_count: number
  consistency_score: number
  consistency_band: 'low' | 'medium' | 'high'
}

export type TeamTrackingActivityItem = {
  action: string
  occurred_at: string
  entity_type: string | null
  entity_id: number | null
  meta: Record<string, unknown> | null
}

export type TeamTrackingDetailResponse = {
  member: TeamTrackingMemberSummary
  trend: TeamTrackingTrendPoint[]
  recent_activity: TeamTrackingActivityItem[]
  date: string
  timezone: string
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const detail =
    typeof err === 'object' && err !== null && 'detail' in err
      ? String((err as { detail?: string }).detail ?? res.statusText)
      : res.statusText
  throw new Error(detail || `HTTP ${res.status}`)
}

async function fetchTrackingOverview(dateIso: string): Promise<TeamTrackingOverviewResponse> {
  const q = new URLSearchParams()
  if (dateIso.trim()) q.set('date', dateIso.trim())
  const res = await apiFetch(`/api/v1/team/tracking/overview?${q}`)
  if (!res.ok) await parseError(res)
  return res.json() as Promise<TeamTrackingOverviewResponse>
}

async function fetchTrackingDetail(
  userId: number,
  dateIso: string,
): Promise<TeamTrackingDetailResponse> {
  const q = new URLSearchParams()
  if (dateIso.trim()) q.set('date', dateIso.trim())
  const res = await apiFetch(`/api/v1/team/tracking/${userId}?${q}`)
  if (!res.ok) await parseError(res)
  return res.json() as Promise<TeamTrackingDetailResponse>
}

async function fetchTrackingMe(dateIso: string): Promise<TeamTrackingDetailResponse> {
  const q = new URLSearchParams()
  if (dateIso.trim()) q.set('date', dateIso.trim())
  const res = await apiFetch(`/api/v1/team/tracking/me?${q}`)
  if (!res.ok) await parseError(res)
  return res.json() as Promise<TeamTrackingDetailResponse>
}

export function useTeamTrackingOverviewQuery(dateIso: string, enabled = true) {
  return useQuery({
    queryKey: ['team', 'tracking', 'overview', dateIso],
    queryFn: () => fetchTrackingOverview(dateIso),
    enabled,
  })
}

export function useTeamTrackingDetailQuery(userId: number, dateIso: string, enabled = true) {
  return useQuery({
    queryKey: ['team', 'tracking', 'detail', userId, dateIso],
    queryFn: () => fetchTrackingDetail(userId, dateIso),
    enabled,
  })
}

export function useTeamTrackingMeQuery(dateIso: string, enabled = true) {
  return useQuery({
    queryKey: ['team', 'tracking', 'me', dateIso],
    queryFn: () => fetchTrackingMe(dateIso),
    enabled,
  })
}

