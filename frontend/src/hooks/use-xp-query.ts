import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type XpMe = {
  xp_total: number
  level: string
  level_label: string
  daily_xp: number
  daily_cap: number
  /** Work streak: consecutive days the daily call target was met. */
  streak: number
  streak_done_today?: boolean
  best_streak?: number
  calls_today?: number
  call_target?: number
  login_streak?: number
  next_level_xp: number | null
  progress_pct: number
  season_year: number | null
  season_month: number | null
}

export type XpHistoryEntry = {
  year: number
  month: number
  final_xp: number
  final_level: string
}

export type XpLeaderboardEntry = {
  user_id: number
  name: string
  level: string
  level_label: string
  xp_total: number
  process_score_7d: number
  /** Present in the admin reassign roster ("leader" | "team") — absent elsewhere. */
  role?: string
}

export const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  rookie:  { bg: 'bg-zinc-500/20',   text: 'text-zinc-400',   border: 'border-zinc-500/30' },
  agent:   { bg: 'bg-info/20',   text: 'text-info-ink',   border: 'border-info/30' },
  pro:     { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' },
  elite:   { bg: 'bg-warning/20',  text: 'text-warning-ink',  border: 'border-warning/30' },
  legend:  { bg: 'bg-destructive/20',   text: 'text-destructive-ink',   border: 'border-destructive/30' },
}

export function useXpMeQuery() {
  return useQuery<XpMe>({
    queryKey: ['xp', 'me'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/xp/me')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function useXpLeaderboardQuery() {
  return useQuery<XpLeaderboardEntry[]>({
    queryKey: ['xp', 'leaderboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/xp/leaderboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 30_000,
  })
}

export type XpPeriod = 'today' | 'week'

export type XpPeriodRow = {
  rank: number
  user_id: number
  name: string
  role: string
  xp: number
}

export type XpPeriodLeaderboard = {
  period: XpPeriod
  items: XpPeriodRow[]
  me: XpPeriodRow | null
  total: number
}

/** XP earned today / this week (IST) — top 10 plus the viewer's own rank. */
export function useXpPeriodLeaderboardQuery(period: XpPeriod) {
  return useQuery<XpPeriodLeaderboard>({
    queryKey: ['xp', 'leaderboard', period],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/xp/leaderboard/period?period=${period}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useXpHistoryQuery() {
  return useQuery<XpHistoryEntry[]>({
    queryKey: ['xp', 'history'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/xp/me/history')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 300_000,
  })
}

export function useReassignEligibleQuery() {
  return useQuery<XpLeaderboardEntry[]>({
    queryKey: ['xp', 'reassign-eligible'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/xp/reassign-eligible')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
  })
}

export function usePingLoginMutation() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/xp/ping-login', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}
