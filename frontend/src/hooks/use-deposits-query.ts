import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

/** Refundable security deposit (₹149–200 at enrollment) — not a sale, no GST, no link to FLP. */

export type DepositConsent = {
  id: number
  state: 'pending' | 'given' | 'withdrawn' | 'expired' | 'replaced'
  amount_rupees: number
  token: string | null
  created_at: string
  expires_at: string
  given_at: string | null
  typed_name: string | null
  withdrawn_at: string | null
}

export type DepositReceipt = {
  receipt_number: string
  lead_id: number
  lead_name: string | null
  lead_phone: string | null
  lead_city: string | null
  amount_rupees: number
  paid_at: string
  payment_mode: string
  payment_mode_label: string
  payment_ref: string
  status: 'held' | 'refunded' | 'cancelled'
  issued_at: string
  refunded_at: string | null
  refund_ref: string | null
  refund_note: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  consent_id: number
  consent_state: string | null
  share_token: string
  pdf_path: string
}

export type LeadDepositState = {
  gate_enabled: boolean
  min_rupees: number
  max_rupees: number
  payment_modes: Record<string, string>
  consent: DepositConsent | null
  receipt: DepositReceipt | null
}

export type DepositSettings = {
  gate_enabled: boolean
  business_name: string
  support_email: string
  operated_by: string
}

export type PaymentDetails = { payment_mode: string; payment_ref: string; paid_at: string }

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: unknown }).detail)
        : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
  })
  if (!res.ok) await parseError(res)
  return res.json() as Promise<T>
}

export const depositKeys = {
  lead: (leadId: number) => ['deposits', 'lead', leadId] as const,
  list: (q: string, status: string) => ['deposits', 'receipts', q, status] as const,
  settings: ['deposits', 'settings'] as const,
}

export function useLeadDepositQuery(leadId: number, enabled = true) {
  return useQuery({
    queryKey: depositKeys.lead(leadId),
    queryFn: () => json<LeadDepositState>(`/api/v1/deposits/leads/${leadId}`),
    enabled,
    // While the lead is reading the consent page, pick up their answer without a reload.
    refetchInterval: (q) => (q.state.data?.consent?.state === 'pending' ? 8000 : false),
  })
}

export function useCreateConsentLinkMutation(leadId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (amountRupees: number) =>
      json<LeadDepositState>(`/api/v1/deposits/leads/${leadId}/consent-link`, {
        method: 'POST',
        body: JSON.stringify({ amount_rupees: amountRupees }),
      }),
    onSuccess: (data) => qc.setQueryData(depositKeys.lead(leadId), data),
  })
}

export function useGenerateReceiptMutation(leadId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PaymentDetails) =>
      json<LeadDepositState>(`/api/v1/deposits/leads/${leadId}/receipt`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(depositKeys.lead(leadId), data)
      void qc.invalidateQueries({ queryKey: ['deposits', 'receipts'] })
    },
  })
}

export function useDepositReceiptsQuery(q: string, status: string) {
  return useQuery({
    queryKey: depositKeys.list(q, status),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' })
      if (q.trim()) params.set('q', q.trim())
      if (status) params.set('status', status)
      return json<{ items: DepositReceipt[]; total: number }>(`/api/v1/deposits/receipts?${params}`)
    },
  })
}

export function useRefundDepositMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ receiptNumber, ...body }: { receiptNumber: string; refunded_at: string; refund_ref: string; note: string }) =>
      json<DepositReceipt>(`/api/v1/deposits/receipts/${encodeURIComponent(receiptNumber)}/refund`, {
        method: 'POST',
        body: JSON.stringify({ ...body, note: body.note.trim() || null }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['deposits'] }),
  })
}

export function useDepositSettingsQuery() {
  return useQuery({ queryKey: depositKeys.settings, queryFn: () => json<DepositSettings>('/api/v1/deposits/settings') })
}

export function useSaveDepositSettingsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DepositSettings>) =>
      json<DepositSettings>('/api/v1/deposits/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (data) => qc.setQueryData(depositKeys.settings, data),
  })
}

export async function fetchDepositConsentEvidence(consentId: number): Promise<Record<string, unknown>> {
  return json<Record<string, unknown>>(`/api/v1/deposits/consents/${consentId}/evidence`)
}

/** Public, for the lead's own browser (no login). */
export const depositPublic = {
  consentInfo: (token: string) =>
    json<{
      business_name: string
      support_email: string
      amount_rupees: number
      masked_phone: string
      state: DepositConsent['state']
    }>(
      `/api/deposit/consent/${token}`,
    ),
  verify: (token: string, phone: string) =>
    json<ConsentTerms>(`/api/deposit/consent/${token}/verify`, { method: 'POST', body: JSON.stringify({ phone }) }),
  accept: (token: string, body: { phone: string; typed_name: string; agreed: boolean; terms_sha256: string }) =>
    json<ConsentTerms>(`/api/deposit/consent/${token}/accept`, { method: 'POST', body: JSON.stringify(body) }),
  saveEmail: (token: string, phone: string, email: string) =>
    json<ConsentTerms>(`/api/deposit/consent/${token}/email`, { method: 'POST', body: JSON.stringify({ phone, email }) }),
  withdraw: (token: string, phone: string) =>
    json<ConsentTerms>(`/api/deposit/consent/${token}/withdraw`, { method: 'POST', body: JSON.stringify({ phone }) }),
  receiptInfo: (token: string) =>
    json<{
      receipt_number: string
      business_name: string
      support_email: string
      masked_phone: string
      status: DepositReceipt['status']
    }>(
      `/api/deposit/receipt/${token}`,
    ),
  receiptPdf: async (token: string, phone: string): Promise<Blob> => {
    const res = await apiFetch(`/api/deposit/receipt/${token}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (!res.ok) await parseError(res)
    return res.blob()
  },
}

export type ConsentTerms = {
  state: DepositConsent['state']
  terms_text: string
  terms_sha256: string
  terms_version: string
  given_at: string | null
  typed_name: string | null
  email: string | null
  welcome_email_sent_at: string | null
  /** Only on the email step: sent | already_sent | saved (kept, but no email went out). */
  email_result?: 'sent' | 'already_sent' | 'saved' | null
}
