import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface EosHealthComponents {
  org_score: number
  avg_leader_score: number
  mission_completion: number
  verification_rate: number
  conversion_rate: number
  zombie_pct: number
  risk_score: number
  campaign_success_pct: number
}

export interface EosHealthResponse {
  health_score: number
  components: EosHealthComponents
  band: string
  computed_at: string
}

export function useEosHealth(enabled = true) {
  return useQuery({
    queryKey: ['eos-health'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/eos-health')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
      return body as EosHealthResponse
    },
    enabled,
    refetchInterval: 120_000,
  })
}
