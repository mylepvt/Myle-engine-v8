import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface RiskSignal {
  type: string
  label: string
  value: number
  detail: string
}

export interface MemberRiskScore {
  user_id: number
  name: string
  score: number
  band: 'low' | 'medium' | 'high' | 'critical'
  signals: RiskSignal[]
}

export interface LeaderRiskScore {
  user_id: number
  name: string
  score: number
  band: 'stable' | 'at_risk' | 'critical'
  team_size: number
  signals: RiskSignal[]
}

export interface OrgRiskStats {
  total_members: number
  total_leaders: number
  low_risk: number
  medium_risk: number
  high_risk: number
  critical_risk: number
  avg_member_score: number
  band_pct_low: number
  band_pct_medium: number
  band_pct_high: number
  band_pct_critical: number
}

export interface PredictiveRiskResponse {
  member_risks: MemberRiskScore[]
  leader_risks: LeaderRiskScore[]
  org_stats: OrgRiskStats
  computed_at: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function usePredictiveRisk(enabled = true) {
  return useQuery({
    queryKey: ['predictive-risk'],
    queryFn: () => fetchJson<PredictiveRiskResponse>('/api/v1/admin/predictive-risk'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useLeaderTeamRisks(enabled = true) {
  return useQuery({
    queryKey: ['leader', 'predictive-risk'],
    queryFn: () => fetchJson<MemberRiskScore[]>('/api/v1/leader/predictive-risk'),
    enabled,
    refetchInterval: 60_000,
  })
}
