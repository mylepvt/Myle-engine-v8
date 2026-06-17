import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface FiresSummary {
  pending_verifications: number
  members_at_risk: number
  zombie_leads: number
  campaign_failures: number
  blockers_waiting: number
  expired_campaigns: number
  campaigns_running: number
}

export interface TeamHealthSummary {
  mission_completion_pct: number
  verification_pct: number
  conversion_pct: number
  zombie_score: number
  blocker_resolution_pct: number
  leader_score: number
  leader_band: string
}

export interface ActionItem {
  member_id: number
  member_name: string
  issue: string
  detail: string
  severity: 'critical' | 'warning' | 'info'
  action_label: string
  action_type: string
  action_ref: string
}

export interface LeaderCommandCenterResponse {
  fires: FiresSummary
  team_health: TeamHealthSummary
  actions: ActionItem[]
  team_size: number
  computed_at: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useLeaderCommandCenter(enabled = true) {
  return useQuery({
    queryKey: ['leader', 'command-center'],
    queryFn: () => fetchJson<LeaderCommandCenterResponse>('/api/v1/leader/command-center'),
    enabled,
    refetchInterval: 30_000,
  })
}
