import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type InvoiceListItem = {
  invoice_number: string
  doc_type: 'tax_invoice' | 'payment_receipt' | 'credit_note'
  user_id: number
  member_name: string
  member_username: string | null
  total_cents: number
  currency: string
  issued_at: string
}

export type InvoiceListResponse = {
  items: InvoiceListItem[]
  total: number
  limit: number
  offset: number
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

export type InvoiceListParams = {
  limit?: number
  offset?: number
  user_id?: number | null
  date_from?: string | null
  date_to?: string | null
  doc_type?: string | null
  q?: string | null
}

export async function fetchInvoices(params: InvoiceListParams = {}): Promise<InvoiceListResponse> {
  const sp = new URLSearchParams()
  if (params.limit != null) sp.set('limit', String(params.limit))
  if (params.offset != null) sp.set('offset', String(params.offset))
  if (params.user_id != null) sp.set('user_id', String(params.user_id))
  if (params.date_from) sp.set('date_from', params.date_from)
  if (params.date_to) sp.set('date_to', params.date_to)
  if (params.doc_type) sp.set('doc_type', params.doc_type)
  if (params.q) sp.set('q', params.q)
  const res = await apiFetch(`/api/v1/invoices?${sp}`)
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useInvoicesQuery(params: InvoiceListParams, enabled = true) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => fetchInvoices(params),
    enabled,
  })
}

export async function postInvoicesBulkDownload(body: {
  date_from?: string | null
  date_to?: string | null
  doc_type?: 'all' | 'tax_invoice' | 'payment_receipt' | 'credit_note'
  username?: string | null
}): Promise<Blob> {
  const res = await apiFetch('/api/v1/invoices/bulk-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.blob()
}

export type InvoiceRefundable = {
  invoice_number: string
  total_cents: number
  lines: { lead_id: number; lead_ref: string; refunded: boolean }[]
}

/** Admin: the leads on a tax invoice and which are already refunded. */
export function useInvoiceRefundableQuery(invoiceNumber: string | null) {
  return useQuery<InvoiceRefundable>({
    queryKey: ['invoices', 'refundable', invoiceNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/invoices/${encodeURIComponent(invoiceNumber ?? '')}/refundable`)
      if (!res.ok) await parseError(res)
      return res.json()
    },
    enabled: invoiceNumber != null,
  })
}

/** Admin: refund leads → wallet credit + GST credit note (+ leads back to the pool). */
export function useRefundInvoiceMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { invoiceNumber: string; leadIds: number[]; reason: string; returnToPool: boolean }) => {
      const res = await apiFetch(`/api/v1/invoices/${encodeURIComponent(args.invoiceNumber)}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: args.leadIds, reason: args.reason, return_to_pool: args.returnToPool }),
      })
      if (!res.ok) await parseError(res)
      return res.json() as Promise<{ credit_note_number: string; amount_cents: number }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] })
      void qc.invalidateQueries({ queryKey: ['wallet'] })
      void qc.invalidateQueries({ queryKey: ['lead-pool'] })
    },
  })
}
