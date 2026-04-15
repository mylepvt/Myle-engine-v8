import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamTodayStats = {
  claimed_today: number
  calls_today: number
  enrolled_today: number
}

async function fetchTeamTodayStats(): Promise<TeamTodayStats> {
  const res = await apiFetch('/api/v1/execution/team-today-stats')
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `HTTP ${res.status}`)
  }
  return res.json() as Promise<TeamTodayStats>
}

export function useTeamTodayStatsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['execution', 'team-today-stats', 'team'],
    queryFn: fetchTeamTodayStats,
    enabled,
    staleTime: 60_000,
  })
}
