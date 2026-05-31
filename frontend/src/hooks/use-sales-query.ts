import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type BillingStage = 'day3' | 'day6'
export type SaleStatus = 'pending' | 'approved' | 'rejected'

export type LeadSale = {
  id: number
  lead_id: number
  billing_stage: BillingStage
  case_credits: string | null
  amount_cents: number | null
  invoice_number: string | null
  fbo_id: string | null
  sponsor_id: string | null
  order_count: number | null
  invoice_date: string | null
  proof_url: string | null
  ocr_confidence: string | null
  auto_verified: boolean
  verify_notes: string | null
  status: SaleStatus
  submitted_by_user_id: number
  owner_user_id: number | null
  approved_by_user_id: number | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export type SaleSubmitResponse = {
  sale: LeadSale
  auto_approved: boolean
  message: string
}

export type SaleListResponse = {
  items: LeadSale[]
  total: number
}

export type SaleDashboardRow = {
  owner_user_id: number | null
  owner_username: string | null
  sale_count: number
  total_case_credits: string
  total_amount_cents: number
}

export type SaleDashboardResponse = {
  scope: 'self' | 'downline' | 'all'
  sale_count: number
  total_case_credits: string
  total_amount_cents: number
  pending_count: number
  rows: SaleDashboardRow[]
}

/** Manual override fields the uploader may supply (OCR fills the rest). */
export type SaleManualFields = {
  case_credits?: string
  amount_cents?: number
  invoice_number?: string
  fbo_id?: string
  sponsor_id?: string
  order_count?: number
  invoice_date?: string
}

async function parseError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    detail?: string
    error?: { message?: string }
  }
  const msg =
    (typeof body.detail === 'string' && body.detail) ||
    body.error?.message ||
    res.statusText ||
    `HTTP ${res.status}`
  throw new Error(msg)
}

async function fetchLeadSales(leadId: number): Promise<SaleListResponse> {
  const res = await apiFetch(`/api/v1/leads/${leadId}/sales`)
  if (!res.ok) await parseError(res)
  return res.json()
}

async function fetchPendingSales(): Promise<SaleListResponse> {
  const res = await apiFetch('/api/v1/sales/pending')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function fetchSalesDashboard(): Promise<SaleDashboardResponse> {
  const res = await apiFetch('/api/v1/sales/dashboard')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function submitSale(args: {
  leadId: number
  billingStage: BillingStage
  file: File
  manual?: SaleManualFields
}): Promise<SaleSubmitResponse> {
  const fd = new FormData()
  fd.append('billing_stage', args.billingStage)
  fd.append('file', args.file)
  const m = args.manual ?? {}
  if (m.case_credits != null) fd.append('case_credits', m.case_credits)
  if (m.amount_cents != null) fd.append('amount_cents', String(m.amount_cents))
  if (m.invoice_number) fd.append('invoice_number', m.invoice_number)
  if (m.fbo_id) fd.append('fbo_id', m.fbo_id)
  if (m.sponsor_id) fd.append('sponsor_id', m.sponsor_id)
  if (m.order_count != null) fd.append('order_count', String(m.order_count))
  if (m.invoice_date) fd.append('invoice_date', m.invoice_date)
  const res = await apiFetch(`/api/v1/leads/${args.leadId}/sales`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

async function approveSale(saleId: number): Promise<LeadSale> {
  const res = await apiFetch(`/api/v1/sales/${saleId}/approve`, { method: 'POST' })
  if (!res.ok) await parseError(res)
  return res.json()
}

async function rejectSale(saleId: number, reason: string): Promise<LeadSale> {
  const res = await apiFetch(`/api/v1/sales/${saleId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

function invalidateSales(qc: ReturnType<typeof useQueryClient>, leadId?: number) {
  void qc.invalidateQueries({ queryKey: ['sales-pending'] })
  void qc.invalidateQueries({ queryKey: ['sales-dashboard'] })
  if (leadId != null) void qc.invalidateQueries({ queryKey: ['lead-sales', leadId] })
}

export function useLeadSalesQuery(leadId: number, enabled = true) {
  return useQuery({
    queryKey: ['lead-sales', leadId],
    queryFn: () => fetchLeadSales(leadId),
    enabled: enabled && Number.isFinite(leadId),
  })
}

export function usePendingSalesQuery(enabled = true) {
  return useQuery({
    queryKey: ['sales-pending'],
    queryFn: fetchPendingSales,
    enabled,
  })
}

export function useSalesDashboardQuery(enabled = true) {
  return useQuery({
    queryKey: ['sales-dashboard'],
    queryFn: fetchSalesDashboard,
    enabled,
  })
}

export function useSubmitSaleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: submitSale,
    onSuccess: (_data, vars) => invalidateSales(qc, vars.leadId),
  })
}

export function useApproveSaleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (saleId: number) => approveSale(saleId),
    onSuccess: (sale) => invalidateSales(qc, sale.lead_id),
  })
}

export function useRejectSaleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: number; reason: string }) =>
      rejectSale(saleId, reason),
    onSuccess: (sale) => invalidateSales(qc, sale.lead_id),
  })
}
