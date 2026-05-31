import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamPersonalFunnel = {
  claimed: number
  video_reached: number
  proof_pending: number
  paid_flp: number
  flp_min_billing_total: number
  pct_video_vs_claimed: number
  pct_proof_vs_video: number
  pct_flp_min_billing_vs_video: number
  pct_flp_min_billing_vs_claimed: number
}

async function fetchTeamPersonalFunnel(): Promise<TeamPersonalFunnel> {
  const res = await apiFetch('/api/v1/execution/personal-funnel')
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `HTTP ${res.status}`)
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
