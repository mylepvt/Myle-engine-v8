import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInvoicesQuery, postInvoicesBulkDownload } from '@/hooks/use-invoices-query'
import { invoiceDownloadUrl } from '@/lib/invoice-url'

type Props = { title: string }

function formatMoney(cents: number, currency: string) {
  const major = cents / 100
  return `${currency} ${major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function typeLabel(t: string) {
  return t === 'tax_invoice' ? 'Tax Invoice' : 'Payment Receipt'
}

export function AdminInvoicesPage({ title }: Props) {
  const [q, setQ] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [docType, setDocType] = useState<string>('all')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkFrom, setBulkFrom] = useState('')
  const [bulkTo, setBulkTo] = useState('')
  const [bulkType, setBulkType] = useState<'all' | 'tax_invoice' | 'payment_receipt'>('all')
  const [bulkUser, setBulkUser] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkErr, setBulkErr] = useState<string | null>(null)

  const listParams = useMemo(
    () => ({
      limit: 50,
      offset: 0,
      q: appliedQ.trim() || null,
      date_from: dateFrom.trim() || null,
      date_to: dateTo.trim() || null,
      doc_type: docType === 'all' ? null : docType,
    }),
    [appliedQ, dateFrom, dateTo, docType],
  )

  const inv = useInvoicesQuery(listParams)

  async function runBulkDownload() {
    setBulkErr(null)
    setBulkBusy(true)
    try {
      const blob = await postInvoicesBulkDownload({
        date_from: bulkFrom.trim() || null,
        date_to: bulkTo.trim() || null,
        doc_type: bulkType,
        username: bulkUser.trim() || null,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'myle-invoices.zip'
      a.click()
      URL.revokeObjectURL(url)
      setBulkOpen(false)
    } catch (e) {
      setBulkErr(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <Button type="button" variant="secondary" size="sm" onClick={() => setBulkOpen((v) => !v)}>
          Bulk download
        </Button>
      </div>

      {bulkOpen ? (
        <div className="surface-elevated space-y-3 p-4 text-sm">
          <p className="font-medium text-foreground">Bulk export (ZIP of HTML + combined file)</p>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">From (YYYY-MM-DD)</span>
              <input
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="field-input w-40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">To (YYYY-MM-DD)</span>
              <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="field-input w-40" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Type</span>
              <select
                value={bulkType}
                onChange={(e) => setBulkType(e.target.value as typeof bulkType)}
                className="field-input w-44"
              >
                <option value="all">All</option>
                <option value="payment_receipt">Receipts only</option>
                <option value="tax_invoice">Invoices only</option>
              </select>
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-xs text-muted-foreground">Username (optional)</span>
              <input
                value={bulkUser}
                onChange={(e) => setBulkUser(e.target.value)}
                placeholder="Partial match"
                className="field-input w-full max-w-xs"
              />
            </label>
          </div>
          {bulkErr ? (
            <p className="text-xs text-destructive" role="alert">
              {bulkErr}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={bulkBusy} onClick={() => void runBulkDownload()}>
              {bulkBusy ? 'Preparing…' : 'Download ZIP'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      <div className="surface-elevated flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="block min-w-[12rem] flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Search member</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedQ(q)
            }}
            placeholder="Username, email, FBO…"
            className="field-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="field-input w-40" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="field-input w-40" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Type</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="field-input w-40">
            <option value="all">All</option>
            <option value="payment_receipt">Receipt</option>
            <option value="tax_invoice">Tax invoice</option>
          </select>
        </label>
        <Button type="button" size="sm" onClick={() => setAppliedQ(q)}>
          Search
        </Button>
      </div>

      {inv.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {inv.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {inv.error instanceof Error ? inv.error.message : 'Error'}
        </p>
      ) : null}

      {inv.data ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 font-medium">Invoice No.</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium">Download</th>
              </tr>
            </thead>
            <tbody>
              {inv.data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No invoices match these filters.
                  </td>
                </tr>
              ) : (
                inv.data.items.map((row) => (
                  <tr key={row.invoice_number} className="border-b border-border/80">
                    <td className="px-3 py-2 font-mono text-xs">{row.invoice_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(row.issued_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-foreground">{row.member_name}</span>
                      {row.member_username ? (
                        <span className="ml-1 text-xs text-muted-foreground">@{row.member_username}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{typeLabel(row.doc_type)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.total_cents, row.currency)}</td>
                    <td className="px-3 py-2">
                      <a
                        href={invoiceDownloadUrl(row.invoice_number)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Showing {inv.data.items.length} of {inv.data.total}
          </p>
        </div>
      ) : null}
    </div>
  )
}
