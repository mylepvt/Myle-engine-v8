import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface LeaderComponentScores {
  mission_completion: number
  verification_rate: number
  conversion_rate: number
  zombie_lead_score: number
  blocker_resolution: number
}

export interface LeaderEffectivenessPublic {
  user_id: number
  name: string
  team_size: number
  weighted_score: number
  band: 'elite' | 'average' | 'critical'
  components: LeaderComponentScores
  weakest_component: string | null
}

export interface LeaderEffectivenessResponse {
  leaders: LeaderEffectivenessPublic[]
  total_leaders: number
  average_score: number
  band_distribution: Record<string, number>
  computed_at: string
}

const KEYS = {
  all: ['leader-effectiveness'] as const,
  admin: ['leader-effectiveness', 'admin'] as const,
  own: ['leader-effectiveness', 'own'] as const,
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useLeaderEffectiveness(enabled = true) {
  return useQuery({
    queryKey: KEYS.admin,
    queryFn: () => fetchJson<LeaderEffectivenessResponse>('/api/v1/admin/leader-effectiveness'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useOwnLeaderEffectiveness(enabled = true) {
  return useQuery({
    queryKey: KEYS.own,
    queryFn: () => fetchJson<LeaderEffectivenessPublic>('/api/v1/leader/effectiveness'),
    enabled,
    refetchInterval: 60_000,
  })
}
