import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type TeamPersonalFunnel = {
  claimed: number
  video_reached: number
  proof_pending: number
  paid_flp: number
  enrolled_total: number
  pct_video_vs_claimed: number
  pct_proof_vs_video: number
  pct_enrolled_vs_video: number
  pct_enrolled_vs_claimed: number
}

async function fetchTeamPersonalFunnel(): Promise<TeamPersonalFunnel> {
  const res = await apiFetch('/api/v1/execution/personal-funnel')
  if (!res.ok) {
    const text = await res.text()
    let body: unknown = null
    try { body = JSON.parse(text) } catch { /* parse error */ }
    const msg = messageFromApiErrorPayload(body, `HTTP ${res.status}`)
    throw new Error(msg)
  }
  return res.json() as Promise<TeamPersonalFunnel>
}

/** Team-only — mirrors legacy ``team_personal_funnel`` / dashboard enrollment strip. */
export function useTeamPersonalFunnelQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['execution', 'personal-funnel', 'team'],
    queryFn: fetchTeamPersonalFunnel,
    enabled,
    staleTime: 60_000,
  })
}
