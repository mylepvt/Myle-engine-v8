import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type RewardPoint = {
  id: number
  step: string
  label: string
  points: number
  double?: boolean
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
  streak?: { days: number; goal: number; doubled: boolean }
  power_hour?: { enabled: boolean; start: string; end: string; active: boolean }
  league?: LeagueInfo
  season?: SeasonInfo
  scratch_cards?: ScratchCardInfo[]
  badges?: { key: string; label: string; earned: boolean }[]
}

export type LeagueInfo = {
  week_start: string
  ends_at: string
  pot_rupees: number
  min_mp: number
  my_team: { name: string; rank: number; score: number; my_points: number } | null
  top: { name: string; score: number; members: number }[]
}

export type SeasonInfo = {
  month: string
  my_rank: number | null
  my_points: number
  top: { rank: number; name: string; points: number; prize_rupees: number }[]
  most_improved: { name: string; gain: number; prize_rupees: number } | null
}

export type ScratchCardInfo = {
  id: number
  source: string
  lead_name: string | null
  scratched: boolean
  amount_rupees: number
  bonus_points: number
}

export type SeasonWinner = {
  kind: 'rank' | 'improved'
  rank: number | null
  user_id: number
  name: string
  points: number
  gain?: number
  prize_rupees: number
  paid_at: string | null
}

export type PowerHourConfig = { enabled: boolean; start: string; end: string }

export type RewardsAdminOverview = {
  power_hour: PowerHourConfig
  scratch: { today_rupees: number; month_rupees: number; daily_cap_rupees: number; monthly_cap_rupees: number }
  league: { week_start: string; pot_rupees: number; winner: string | null; paid_to: number }[]
  league_live: { name: string; members: number; points: number; score: number }[]
  seasons: { month: string; winners: SeasonWinner[] }[]
  season_live: {
    month: string
    top: { rank: number; user_id: number; name: string; points: number; prize_rupees: number }[]
    most_improved: { name: string; gain: number; prize_rupees: number } | null
  }
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

async function sendJson(path: string, method: string, body?: unknown) {
  const res = await apiFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${res.status}`)
  return data
}

export function useScratchCardMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      sendJson(`/api/v1/rewards/scratch/${id}`, 'POST') as Promise<{ id: number; amount_rupees: number; bonus_points: number }>,
    onSettled: () => qc.invalidateQueries({ queryKey: ['rewards', 'me'] }),
  })
}

export function useRewardsAdminOverviewQuery(enabled = true) {
  return useQuery<RewardsAdminOverview>({
    queryKey: ['rewards', 'admin', 'overview'],
    queryFn: () => getJson('/api/v1/rewards/admin/overview'),
    enabled,
    staleTime: 60_000,
  })
}

export function usePowerHourMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cfg: PowerHourConfig) => sendJson('/api/v1/rewards/admin/power-hour', 'PUT', cfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards'] }),
  })
}

export function useSeasonPaidMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ month, user_id, paid }: { month: string; user_id: number; paid: boolean }) =>
      sendJson(`/api/v1/rewards/admin/season/${month}/paid`, 'POST', { user_id, paid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards', 'admin', 'overview'] }),
  })
}
