import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import type { LeadPublic } from '@/hooks/use-leads-query'

async function fetchHandedOffLeads(): Promise<LeadPublic[]> {
  const res = await apiFetch('/api/v1/execution/handed-off-leads')
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `HTTP ${res.status}`)
  }
  return res.json() as Promise<LeadPublic[]>
}

/**
 * Team-only — read-only progress of the member's own leads that have been
 * handed off to their upline leader. Lets the team member see the current stage
 * and per-task checklist even after execution moved away from them.
 */
export function useHandedOffLeadsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['execution', 'handed-off-leads', 'team'],
    queryFn: fetchHandedOffLeads,
    enabled,
    staleTime: 60_000,
  })
}
