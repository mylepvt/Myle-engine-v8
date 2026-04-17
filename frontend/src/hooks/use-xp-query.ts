import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type XpMe = {
  xp_total: number
  level: string
  level_label: string
  daily_xp: number
  daily_cap: number
  streak: number
  next_level_xp: number
  progress_pct: number
}

export type XpLeaderboardEntry = {
  user_id: number
  name: string
  level: string
  level_label: string
  xp_total: number
}

export const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  rookie:  { bg: 'bg-zinc-500/20',   text: 'text-zinc-400',   border: 'border-zinc-500/30' },
  agent:   { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  pro:     { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' },
  elite:   { bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/30' },
  legend:  { bg: 'bg-rose-500/20',   text: 'text-rose-400',   border: 'border-rose-500/30' },
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

export function usePingLoginMutation() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/xp/ping-login', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}
