import { useRef, useState, type ChangeEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useLeadSalesQuery,
  useSubmitSaleMutation,
  type BillingStage,
  type LeadSale,
} from '@/hooks/use-sales-query'
import type { Role } from '@/types/role'

type Props = {
  leadId: number
  surfaceRole: Role | null
}

const STAGES: { key: BillingStage; label: string; hint: string }[] = [
  { key: 'day3', label: 'Day 3 Billing', hint: 'Pehli FLP billing — invoice upload karo.' },
  { key: 'day6', label: 'Day 6 Closing Billing', hint: 'Closing billing — invoice upload karo.' },
]

function inr(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function statusVariant(status: LeadSale['status']) {
  if (status === 'approved') return 'default' as const
  if (status === 'rejected') return 'destructive' as const
  return 'outline' as const
}

function StageBlock({
  leadId,
  stage,
  label,
  hint,
  sale,
}: {
  leadId: number
  stage: BillingStage
  label: string
  hint: string
  sale: LeadSale | undefined
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const submit = useSubmitSaleMutation()
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Allow (re)upload when no record yet or the previous one was rejected.
  const canUpload = !sale || sale.status === 'rejected'

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocalErr(null)
    setNotice(null)
    try {
      const res = await submit.mutateAsync({ leadId, billingStage: stage, file })
      setNotice(
        res.auto_approved
          ? 'Invoice scan clear — auto-approved.'
          : res.message || 'Invoice uploaded — admin approval pending.',
      )
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div className="rounded border border-border/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {sale ? (
          <Badge variant={statusVariant(sale.status)}>{sale.status}</Badge>
        ) : (
          <Badge variant="outline">not billed</Badge>
        )}
        {sale?.auto_verified ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-400">
            auto-verified
          </span>
        ) : null}
      </div>

      {sale ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Case Credits</span>
          <span className="text-foreground">{sale.case_credits ?? '—'}</span>
          <span className="text-muted-foreground">Amount</span>
          <span className="text-foreground">{inr(sale.amount_cents)}</span>
          {sale.invoice_number ? (
            <>
              <span className="text-muted-foreground">Invoice #</span>
              <span className="text-foreground break-all">{sale.invoice_number}</span>
            </>
          ) : null}
          {sale.invoice_date ? (
            <>
              <span className="text-muted-foreground">Invoice date</span>
              <span className="text-foreground">{sale.invoice_date}</span>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}

      {sale?.proof_url ? (
        <a
          href={sale.proof_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-primary underline underline-offset-2"
        >
          View invoice
        </a>
      ) : null}

      {sale?.status === 'pending' && sale.verify_notes ? (
        <p className="text-[11px] text-amber-300/90">{sale.verify_notes}</p>
      ) : null}
      {sale?.status === 'rejected' && sale.rejection_reason ? (
        <p className="text-[11px] text-destructive">Rejected: {sale.rejection_reason}</p>
      ) : null}

      {canUpload ? (
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onPick(e)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={submit.isPending}
            className="h-9 w-full text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {submit.isPending
              ? 'Uploading…'
              : sale?.status === 'rejected'
                ? 'Re-upload invoice'
                : `Upload ${label} invoice`}
          </Button>
        </div>
      ) : null}

      {notice ? <p className="text-[11px] text-emerald-300">{notice}</p> : null}
      {localErr ? (
        <p className="text-[11px] text-destructive" role="alert">
          {localErr}
        </p>
      ) : null}
    </div>
  )
}

export function LeadBillingCard({ leadId, surfaceRole }: Props) {
  const { data, isPending, isError, error, refetch } = useLeadSalesQuery(leadId)

  const byStage = (stage: BillingStage): LeadSale | undefined =>
    data?.items.find((s) => s.billing_stage === stage)

  const totalCc = (data?.items ?? [])
    .filter((s) => s.status === 'approved' && s.case_credits)
    .reduce((acc, s) => acc + Number(s.case_credits), 0)

  return (
    <div className="surface-elevated p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-ds-label uppercase text-muted-foreground">CC / Billing</p>
        {totalCc > 0 ? (
          <span className="text-xs font-semibold text-emerald-300">
            {totalCc.toFixed(3)} CC
          </span>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading billing…</p>
      ) : isError ? (
        <p className="text-xs text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load billing'}{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </p>
      ) : (
        <div className="space-y-2">
          {STAGES.map((s) => (
            <StageBlock
              key={s.key}
              leadId={leadId}
              stage={s.key}
              label={s.label}
              hint={s.hint}
              sale={byStage(s.key)}
            />
          ))}
          {surfaceRole !== 'admin' ? (
            <p className="text-[11px] text-muted-foreground">
              Clear invoice scan auto-approve ho jata hai; warna admin approval pending rehti hai.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
