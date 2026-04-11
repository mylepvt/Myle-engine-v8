import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import type { LeadPublic, LeadListResponse } from '@/hooks/use-leads-query'

// LeadPublic already includes pool_price_cents — alias for clarity
export type PoolLead = LeadPublic

export type PoolLeadListResponse = LeadListResponse

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchLeadPool(): Promise<PoolLeadListResponse> {
  const res = await apiFetch('/api/v1/lead-pool')
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export function useLeadPoolQuery(enabled = true) {
  return useQuery({
    queryKey: ['lead-pool'],
    queryFn: fetchLeadPool,
    enabled,
  })
}
