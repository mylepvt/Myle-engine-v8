import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type LosMemberRow = {
  user_id: number
  name: string
  username: string | null
  calls_today: number
  call_target: number
  call_gate_met: boolean
  enrollments: number
  fu_due: number
  is_active: boolean
}

export type LosSnapshot = {
  date: string
  active_count: number
  inactive_count: number
  total_members: number
  total_calls_today: number
  calls_team_target: number
  activations_today: number
  activations_target: number
  billing_today_rupees: number
  follow_ups_pending: number
  members: LosMemberRow[]
  leader_score: number
  leader_tier: 'strong' | 'average' | 'at_risk'
}

async function fetchLosSnapshot(activationsTarget: number): Promise<LosSnapshot> {
  const res = await apiFetch(`/api/v1/execution/los-snapshot?activations_target=${activationsTarget}`)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `HTTP ${res.status}`)
  }
  return res.json() as Promise<LosSnapshot>
}

export function useLosQuery(enabled: boolean, activationsTarget = 5) {
  return useQuery({
    queryKey: ['execution', 'los-snapshot', activationsTarget],
    queryFn: () => fetchLosSnapshot(activationsTarget),
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
  })
}
