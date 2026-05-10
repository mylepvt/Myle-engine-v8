import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type LeaderHealthItem = {
  leader_id: number
  leader_name: string
  fbo_id: string
  presence_status: 'online' | 'offline' | 'idle'
  personal_calls_today: number
  personal_consistency_score: number
  personal_consistency_band: 'low' | 'medium' | 'high'
  personal_leads_added: number
  personal_followups_done: number
  team_size: number
  team_calls_today: number
  team_avg_score: number
  team_online_count: number
  day2_leads_count: number
}

export type LeaderHealthResponse = {
  date: string
  leaders: LeaderHealthItem[]
}

async function fetchLeaderHealth(): Promise<LeaderHealthResponse> {
  const res = await apiFetch('/api/v1/admin/leader-health')
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as { detail?: string }).detail ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return body as LeaderHealthResponse
}

export function useLeaderHealthQuery(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'leader-health'],
    queryFn: fetchLeaderHealth,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
