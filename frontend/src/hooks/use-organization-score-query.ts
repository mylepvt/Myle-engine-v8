import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface OrgComponentScores {
  mission_completion: number
  verification: number
  lead_activity: number
  zombie_leads: number
}

export interface OrganizationScoreResponse {
  overall_score: number
  components: OrgComponentScores
  total_members: number
  total_leads: number
  computed_at: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useOrganizationScore(enabled = true) {
  return useQuery({
    queryKey: ['organization-score'],
    queryFn: () => fetchJson<OrganizationScoreResponse>('/api/v1/admin/organization-score'),
    enabled,
    refetchInterval: 120_000,
  })
}
