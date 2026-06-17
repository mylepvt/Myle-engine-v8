import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RejectReasonModal } from '@/components/ui/reject-reason-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  usePendingSalesQuery,
  useApproveSaleMutation,
  useRejectSaleMutation,
  type LeadSale,
} from '@/hooks/use-sales-query'
import { playAppSound } from '@/lib/app-sounds'
import { ClipboardList, ExternalLink } from 'lucide-react'

type Props = { title: string }

function inr(cents: number | null): string | null {
  if (cents == null) return null
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function stageLabel(stage: LeadSale['billing_stage']): string {
  return stage === 'day3' ? 'Day 3 Billing' : 'Day 6 Closing'
}

export function SalesApprovalsPage({ title }: Props) {
  const navigate = useNavigate()
  const { data: me } = useAuthMeQuery()
  const { data, isPending, isError, error, refetch } = usePendingSalesQuery()
  const approve = useApproveSaleMutation()
  const reject = useRejectSaleMutation()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const busy = approve.isPending || reject.isPending
  const [rejectTarget, setRejectTarget] = useState<number | null>(null)
  // Per-row CC / amount edits (admin corrects what OCR missed before booking).
  const [edits, setEdits] = useState<Record<number, { cc: string; amount: string }>>({})

  function ccValue(row: LeadSale): string {
    return edits[row.id]?.cc ?? (row.case_credits ?? '')
  }
  function amountValue(row: LeadSale): string {
    return edits[row.id]?.amount ?? (row.amount_cents != null ? String(row.amount_cents / 100) : '')
  }
  function setEdit(row: LeadSale, patch: Partial<{ cc: string; amount: string }>) {
    setEdits((prev) => ({
      ...prev,
      [row.id]: { cc: ccValue(row), amount: amountValue(row), ...patch },
    }))
  }

  async function handleApprove(row: LeadSale) {
    const ccStr = ccValue(row).trim()
    const amtStr = amountValue(row).trim()
    const overrides: { case_credits?: string; amount_cents?: number } = {}
    if (ccStr) overrides.case_credits = ccStr
    if (amtStr) {
      const rupees = Number(amtStr)
      if (Number.isFinite(rupees)) overrides.amount_cents = Math.round(rupees * 100)
    }
    await approve.mutateAsync({ saleId: row.id, overrides })
    playAppSound('claim')
  }

  async function handleReject(saleId: number, reason: string) {
    setRejectTarget(null)
    await reject.mutateAsync({ saleId, reason })
    playAppSound('error')
  }

  return (
    <div className="max-w-2xl space-y-4 md:space-y-6">
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          ← Back
        </button>
        <h1 className="text-ds-h2">{title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? 'CC/sale invoices jo auto-verify nahi hui — yahan approve ya reject karo.'
          : 'Aapke downline ki pending CC/sale invoices. Admin in ko approve/reject karta hai.'}
      </p>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {(approve.isError || reject.isError) ? (
        <div className="text-sm text-destructive" role="alert">
          {(approve.error ?? reject.error) instanceof Error
            ? (approve.error ?? reject.error)!.message
            : 'Could not update invoice'}
        </div>
      ) : null}

      {data && data.total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded border border-dashed border-border dark:border-white/[0.12] py-14 text-center">
          <ClipboardList className="size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No pending CC/sale invoices</p>
          <p className="text-xs text-muted-foreground">Auto-verified sales skip this queue.</p>
        </div>
      ) : null}

      {data && data.total > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {data.total} pending invoice{data.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {data.items.map((row) => {
              const amount = inr(row.amount_cents)
              return (
                <li
                  key={row.id}
                  className="surface-elevated flex flex-col gap-3 rounded border border-border/60 p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">Lead #{row.lead_id}</p>
                      <Badge variant="outline">{stageLabel(row.billing_stage)}</Badge>
                      <Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'outline'}>
                        {row.status}
                      </Badge>
                    </div>
                    {isAdmin ? (
                      <div className="flex flex-wrap items-end gap-3 pt-1">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">Case credits</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            inputMode="decimal"
                            value={ccValue(row)}
                            onChange={(e) => setEdit(row, { cc: e.target.value })}
                            placeholder="0.000"
                            className="h-9 w-28 rounded border border-border bg-background px-2 text-sm tabular-nums focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground">Amount (₹)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={amountValue(row)}
                            onChange={(e) => setEdit(row, { amount: e.target.value })}
                            placeholder="0.00"
                            className="h-9 w-32 rounded border border-border bg-background px-2 text-sm tabular-nums focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        {row.invoice_number ? (
                          <span className="pb-2 text-[11px] text-muted-foreground">#{row.invoice_number}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {row.case_credits ? <span>CC: {row.case_credits} · </span> : null}
                        {amount ? <span>{amount} · </span> : null}
                        {row.invoice_number ? <span>#{row.invoice_number}</span> : null}
                      </div>
                    )}
                    {isAdmin && (!ccValue(row).trim() || !amountValue(row).trim()) ? (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Enter CC and amount to book this invoice.
                      </p>
                    ) : null}
                    {row.verify_notes ? (
                      <p className="text-xs text-amber-600/90 dark:text-amber-300/90">{row.verify_notes}</p>
                    ) : null}
                    {row.ocr_confidence ? (
                      <p className="text-[11px] text-muted-foreground">
                        OCR confidence: {(Number(row.ocr_confidence) * 100).toFixed(0)}%
                      </p>
                    ) : null}
                    {row.proof_url ? (
                      <a
                        href={row.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                      >
                        View invoice
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                  {isAdmin ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="default"
                        variant="default"
                        disabled={busy}
                        className="h-11 min-w-[5.5rem] flex-1 font-semibold sm:flex-none"
                        onClick={() => void handleApprove(row)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="default"
                        variant="outline"
                        disabled={busy}
                        className="h-11 min-w-[5rem] flex-1 border-destructive/50 font-semibold text-destructive hover:bg-destructive/10 sm:flex-none"
                        onClick={() => setRejectTarget(row.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <RejectReasonModal
        open={rejectTarget !== null}
        title="Reject Invoice"
        description="Why are you rejecting this invoice?"
        defaultReason="Invoice unclear or invalid"
        onConfirm={(reason) => { if (rejectTarget !== null) void handleReject(rejectTarget, reason) }}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  )
}
