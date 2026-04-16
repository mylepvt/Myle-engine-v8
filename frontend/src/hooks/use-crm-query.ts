/**
 * CRM hooks — all calls go through FastAPI proxy at /api/v1/crm/*
 * which forwards to the CRM Fastify microservice.
 *
 * FastAPI = gate (auth), CRM = brain (FSM, wallet, scoring).
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
// Lead FSM transition
// ---------------------------------------------------------------------------

/** CRM FSM events — must match apps/crm-api/src/domain/fsm.ts FSM_EVENT_VALUES */
export type FsmEvent =
  | 'INVITE_SENT'
  | 'WHATSAPP_SENT'
  | 'VIDEO_SENT'
  | 'PAYMENT_DONE'
  | 'MINDSET_START'
  | 'MINDSET_COMPLETE'
  | 'DAY1_DONE'
  | 'DAY2_DONE'
  | 'DAY3_DONE'
  | 'CLOSE_WON'

export interface LeadTransitionPayload {
  event: FsmEvent
  expectedVersion?: number
}

export function useCrmLeadTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, payload }: { leadId: number; payload: LeadTransitionPayload }) =>
      crmFetch(`/leads/${leadId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['crm-escalations'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Lead reassign
// ---------------------------------------------------------------------------

export function useCrmLeadReassign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      leadId,
      toUserId,
      reason,
    }: {
      leadId: number
      toUserId: string
      reason?: string
    }) =>
      crmFetch(`/leads/${leadId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Pool claim
// ---------------------------------------------------------------------------

export function useCrmPoolClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId }: { leadId: number }) =>
      crmFetch('/pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-pool'] })
      qc.invalidateQueries({ queryKey: ['crm-wallet'] })
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
// Escalations
// ---------------------------------------------------------------------------

export function useCrmEscalations() {
  return useQuery({
    queryKey: ['crm-escalations'],
    queryFn: () => crmFetch<{ items: unknown[]; total: number }>('/escalations'),
    staleTime: 60_000,
  })
}

export function useCrmAckEscalation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      crmFetch(`/escalations/${id}/ack`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-escalations'] })
    },
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
