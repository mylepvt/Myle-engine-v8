import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface BlockerBreakdown {
  reason: string
  label: string
  count: number
  pct: number
}

export interface BlockerIntelligence {
  current_summary: BlockerBreakdown[]
  total_current: number
  previous_summary: BlockerBreakdown[]
  total_previous: number
  biggest_blocker: string
  biggest_blocker_label: string
  biggest_blocker_pct: number
  suggestion: string
  computed_at: string
}

export function useBlockerIntelligence(enabled = true) {
  return useQuery({
    queryKey: ['blocker-intelligence'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/blocker-intelligence')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
      return body as BlockerIntelligence
    },
    enabled,
    refetchInterval: 120_000,
  })
}
