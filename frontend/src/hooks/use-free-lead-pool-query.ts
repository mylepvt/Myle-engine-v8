import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import type { LeadPublic } from '@/hooks/use-leads-query'

export type FreePoolBatchPreviewResponse = {
  requested_count: number
  claim_count: number
  available_count: number
}

export type FreePoolClaimBatchResponse = {
  leads: LeadPublic[]
  claimed_count: number
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  let msg = res.statusText
  if (typeof err === 'object' && err !== null) {
    if ('error' in err) {
      msg = String((err as { error?: { message?: string } }).error?.message ?? msg)
    } else if ('detail' in err) {
      const d = (err as { detail?: unknown }).detail
      msg = typeof d === 'string' ? d : JSON.stringify(d)
    }
  }
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchFreePoolBatchPreview(count: number): Promise<FreePoolBatchPreviewResponse> {
  const res = await apiFetch(`/api/v1/free-lead-pool/batch-preview?count=${count}`)
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useFreePoolBatchPreviewQuery(count: number, enabled = true) {
  return useQuery({
    queryKey: ['free-lead-pool', 'batch-preview', count],
    queryFn: () => fetchFreePoolBatchPreview(count),
    enabled,
  })
}

async function claimFreePoolBatch(count: number): Promise<FreePoolClaimBatchResponse> {
  const res = await apiFetch('/api/v1/free-lead-pool/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useFreePoolBatchClaimMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimFreePoolBatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['free-lead-pool'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['workboard'] })
    },
  })
}
