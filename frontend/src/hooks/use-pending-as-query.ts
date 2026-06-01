import { useQuery } from '@tanstack/react-query'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { apiFetch } from '@/lib/api'
import type { LeadListResponse } from '@/hooks/use-leads-query'

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

export async function fetchPendingAsLeads(): Promise<LeadListResponse> {
  const res = await apiFetch('/api/v1/pending-as')
  if (!res.ok) await parseError(res)
  return res.json()
}

export function usePendingAsQuery() {
  const { data: me } = useAuthMeQuery()
  const sessionReady = me?.authenticated === true
  return useQuery({
    queryKey: ['pending-as', 'leads'],
    queryFn: fetchPendingAsLeads,
    enabled: sessionReady,
  })
}
