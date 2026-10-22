import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type WalletRecharge = {
  id: number
  user_id: number
  member_name?: string | null
  member_fbo_id?: string | null
  amount_cents: number
  utr_number: string | null
  proof_url: string | null
  status: string
  admin_note: string | null
  reviewed_by_user_id: number | null
  reviewed_by_name?: string | null
  reviewed_at: string | null
  created_at: string
  invoice_number?: string | null
}

export type WalletRechargeCreate = {
  amount_cents: number
  utr_number: string
  proof_url?: string
  idempotency_key?: string
}

export type WalletRechargeListResponse = {
  items: WalletRecharge[]
  total: number
  limit: number
  offset: number
}

export type WalletRechargeInstructions = {
  upi_id: string
  qr_image_url: string | null
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchRechargeRequests(): Promise<WalletRechargeListResponse> {
  const res = await apiFetch('/api/v1/wallet/recharge-requests')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function fetchRechargeInstructions(): Promise<WalletRechargeInstructions> {
  const res = await apiFetch('/api/v1/wallet/recharge-instructions')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function postRechargeRequest(body: WalletRechargeCreate): Promise<WalletRecharge> {
  const res = await apiFetch('/api/v1/wallet/recharge-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

async function patchRechargeRequest(
  id: number,
  body: { status: 'approved' | 'rejected'; admin_note?: string },
): Promise<WalletRecharge> {
  const res = await apiFetch(`/api/v1/wallet/recharge-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

function invalidateRechargeAndWallet(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['wallet-recharge-requests'] })
  void qc.invalidateQueries({ queryKey: ['wallet'] })
}

export function useWalletRechargeRequestsQuery() {
  return useQuery({
    queryKey: ['wallet-recharge-requests'],
    queryFn: fetchRechargeRequests,
  })
}

export function useWalletRechargeInstructionsQuery() {
  return useQuery({
    queryKey: ['wallet-recharge-instructions'],
    queryFn: fetchRechargeInstructions,
  })
}

export function useCreateRechargeRequestMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: postRechargeRequest,
    onSuccess: () => invalidateRechargeAndWallet(qc),
  })
}

export function useReviewRechargeRequestMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number
      body: { status: 'approved' | 'rejected'; admin_note?: string }
    }) => patchRechargeRequest(id, body),
    onSuccess: () => invalidateRechargeAndWallet(qc),
  })
}

// ── Free recharge requests (leader asks for self / own team, admin decides) ──

export type FreeRecharge = {
  id: number
  user_id: number
  member_name?: string | null
  member_fbo_id?: string | null
  requested_by_user_id: number
  requested_by_name?: string | null
  amount_cents: number
  reason: string
  status: string
  admin_note: string | null
  reviewed_by_user_id: number | null
  reviewed_by_name?: string | null
  reviewed_at: string | null
  created_at: string
}

export type FreeRechargeCreate = {
  user_id: number
  amount_cents: number
  reason: string
  idempotency_key?: string
}

async function fetchFreeRecharges(): Promise<{ items: FreeRecharge[]; total: number }> {
  const res = await apiFetch('/api/v1/wallet/free-recharge-requests?limit=100')
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useFreeRechargeRequestsQuery(enabled = true) {
  return useQuery({
    queryKey: ['wallet-free-recharge-requests'],
    queryFn: fetchFreeRecharges,
    enabled,
  })
}

export function useCreateFreeRechargeMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: FreeRechargeCreate): Promise<FreeRecharge> => {
      const res = await apiFetch('/api/v1/wallet/free-recharge-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) await parseError(res)
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet-free-recharge-requests'] })
      void qc.invalidateQueries({ queryKey: ['my-team'] })
    },
  })
}

export function useReviewFreeRechargeMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number
      body: { status: 'approved' | 'rejected'; admin_note?: string }
    }): Promise<FreeRecharge> => {
      const res = await apiFetch(`/api/v1/wallet/free-recharge-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) await parseError(res)
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet-free-recharge-requests'] })
      void qc.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
}
