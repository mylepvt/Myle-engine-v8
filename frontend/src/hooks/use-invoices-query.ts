import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type InvoiceListItem = {
  invoice_number: string
  doc_type: 'tax_invoice' | 'payment_receipt'
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
  doc_type?: 'all' | 'tax_invoice' | 'payment_receipt'
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
