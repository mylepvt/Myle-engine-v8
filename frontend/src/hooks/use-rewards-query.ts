import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type RewardPoint = {
  id: number
  step: string
  label: string
  points: number
  lead_name: string | null
  at: string
  revoked: boolean
}

export type PipelineLead = {
  lead_id: number
  name: string | null
  status: string
  potential_rupees: number
  at_risk: boolean
}

export type JackpotDraw = {
  date: string
  pot_rupees: number
  winner_user_id: number | null
  winner_name: string | null
  players: number
  tickets_total: number
  rolled_over: boolean
}

export type MyRewards = {
  eligible: boolean
  points_today: number
  points_total: number
  tickets: number
  max_tickets: number
  mp_per_ticket: number
  next_ticket_in: number
  pot_rupees: number
  draw_at: string
  last_draw: JackpotDraw | null
  recent: RewardPoint[]
  pipeline: {
    total_rupees: number
    at_risk_rupees: number
    active: number
    at_risk: number
    leads: PipelineLead[]
  }
  table: { step: string; label: string; points: number }[]
}

export type AdminRewardPoint = {
  id: number
  user_id: number
  user_name: string
  lead_id: number
  lead_name: string | null
  step: string
  label: string
  points: number
  at: string
  revoked_at: string | null
  revoked_reason: string | null
}

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** My MYLE Points, jackpot tickets and pipeline — refreshed every minute. */
export function useMyRewardsQuery() {
  return useQuery<MyRewards>({
    queryKey: ['rewards', 'me'],
    queryFn: () => getJson('/api/v1/rewards/me'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useAdminRewardPointsQuery(enabled = true) {
  return useQuery<{ points: AdminRewardPoint[] }>({
    queryKey: ['rewards', 'admin', 'points'],
    queryFn: () => getJson('/api/v1/rewards/admin/points?days=7'),
    enabled,
    staleTime: 30_000,
  })
}

export function useAdminDrawsQuery(enabled = true) {
  return useQuery<{ draws: JackpotDraw[] }>({
    queryKey: ['rewards', 'admin', 'draws'],
    queryFn: () => getJson('/api/v1/rewards/admin/draws'),
    enabled,
    staleTime: 60_000,
  })
}

export function useRevokePointMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/v1/rewards/admin/points/${id}/revoke`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards'] }),
  })
}
