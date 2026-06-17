import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type MemberActivityMap = {
  user_id: number
  days: number
  lifetime: boolean
  total: number
  active_days: number
  window_days: number
  consistency_pct: number
  longest_streak: number
  first_at: string | null
  last_at: string | null
  peak_hour: number | null
  peak_dow: number | null
  by_category: Record<string, number>
  by_hour: number[]
  by_dow: number[]
  daily_series: { date: string; count: number }[]
  tags: string[]
}

async function fetchMap(userId: number, days: number): Promise<MemberActivityMap> {
  const res = await apiFetch(`/api/v1/analytics/member-activity-map?user_id=${userId}&days=${days}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<MemberActivityMap>
}

export function useMemberActivityMap(userId: number | null, days: number) {
  return useQuery({
    queryKey: ['member-activity-map', userId, days],
    queryFn: () => fetchMap(userId as number, days),
    enabled: userId != null,
    staleTime: 60_000,
  })
}
