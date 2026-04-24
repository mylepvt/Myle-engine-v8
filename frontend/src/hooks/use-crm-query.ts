/**
 * CRM hooks — all calls go through FastAPI proxy at /api/v1/crm/*
 * which forwards to the CRM Fastify microservice.
 *
 * FastAPI owns the lead lifecycle; CRM remains for wallet, pool, and scoring surfaces.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

async function crmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/v1/crm${path}`, init)
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = messageFromApiErrorPayload(raw, res.statusText)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return raw as T
}

// ---------------------------------------------------------------------------
// Pool claim
// ---------------------------------------------------------------------------

export type CrmPoolClaimInput =
  | {
      leadId: number
      idempotencyKey: string
      pipelineKind?: 'PERSONAL' | 'TEAM'
    }
  | {
      /** FIFO batch (1–50); mutually exclusive with ``leadId``. */
      count: number
      idempotencyKey: string
      pipelineKind?: 'PERSONAL' | 'TEAM'
    }

export function useCrmPoolClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: CrmPoolClaimInput) => {
      const pipelineKind = vars.pipelineKind ?? 'PERSONAL'
      if ('count' in vars) {
        return crmFetch<{ leads: unknown[]; totalPriceCents: number }>('/pool/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: vars.count,
            idempotencyKey: vars.idempotencyKey,
            pipelineKind,
          }),
        })
      }
      return crmFetch('/pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: vars.leadId,
          idempotencyKey: vars.idempotencyKey,
          pipelineKind,
        }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-pool'] })
      qc.invalidateQueries({ queryKey: ['crm-wallet'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function useCrmWalletBalance() {
  return useQuery({
    queryKey: ['crm-wallet', 'balance'],
    queryFn: () => crmFetch<{ balance: number; currency: string }>('/wallet/balance'),
    staleTime: 30_000,
  })
}

export function useCrmWalletLedger(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['crm-wallet', 'ledger', page, pageSize],
    queryFn: () =>
      crmFetch<{ entries: unknown[]; total: number }>(
        `/wallet/ledger?page=${page}&pageSize=${pageSize}`,
      ),
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export function useCrmPerformanceSnapshots() {
  return useQuery({
    queryKey: ['crm-performance'],
    queryFn: () => crmFetch<{ snapshots: unknown[] }>('/performance/snapshots'),
    staleTime: 60_000,
  })
}
