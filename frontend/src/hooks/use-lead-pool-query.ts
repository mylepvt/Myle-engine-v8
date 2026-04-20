import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import type { LeadPublic, LeadListResponse } from '@/hooks/use-leads-query'

// LeadPublic already includes pool_price_cents — alias for clarity
export type PoolLead = LeadPublic

export type PoolLeadListResponse = LeadListResponse

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

export type LeadPoolDefaults = {
  default_pool_price_cents: number
}

export type LeadPoolBatchClaimResponse = {
  leads: PoolLead[]
  total_price_cents: number
}

async function fetchLeadPoolDefaults(): Promise<LeadPoolDefaults> {
  const res = await apiFetch('/api/v1/lead-pool/defaults')
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export function useLeadPoolDefaultsQuery(enabled = true) {
  return useQuery({
    queryKey: ['lead-pool', 'defaults'],
    queryFn: fetchLeadPoolDefaults,
    enabled,
  })
}

export function useLeadPoolDefaultsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: LeadPoolDefaults) => {
      const res = await apiFetch('/api/v1/lead-pool/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await parseError(res)
      }
      return res.json() as Promise<LeadPoolDefaults>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-pool', 'defaults'] })
      void qc.invalidateQueries({ queryKey: ['lead-pool'] })
    },
  })
}

async function claimLeadPoolBatch(count: number): Promise<LeadPoolBatchClaimResponse> {
  const res = await apiFetch('/api/v1/lead-pool/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export function useLeadPoolBatchClaimMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimLeadPoolBatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-pool'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['workboard'] })
      void qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}
