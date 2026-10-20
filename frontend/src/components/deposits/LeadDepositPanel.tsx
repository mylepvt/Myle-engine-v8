import { useState } from 'react'
import { CheckCircle2, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { DepositConsentStep } from '@/components/deposits/DepositConsentStep'
import { DepositReceiptCard } from '@/components/deposits/DepositReceiptCard'
import { PaymentDetailsFields } from '@/components/deposits/PaymentDetailsFields'
import { emptyPaymentDraft, paymentDraftBody, paymentDraftError } from '@/lib/deposits'
import { useGenerateReceiptMutation, useLeadDepositQuery } from '@/hooks/use-deposits-query'
import { useDepositReceiptStore } from '@/stores/deposit-receipt-store'

type LeadLike = { id: number; name?: string | null; phone?: string | null; enrollment_amount_cents?: number | null }

/** The enrollment record's deposit receipt — or "Generate Receipt" when it has none yet. */
function LeadDepositBody({ lead }: { lead: LeadLike }) {
  const q = useLeadDepositQuery(lead.id)
  const gen = useGenerateReceiptMutation(lead.id)
  const [draft, setDraft] = useState(emptyPaymentDraft)

  if (q.isPending) return <p className="text-ds-caption text-muted-foreground">Loading…</p>
  if (q.isError) return <p className="text-ds-caption text-destructive">{q.error.message}</p>
  const state = q.data
  if (state.receipt) return <DepositReceiptCard receipt={state.receipt} />

  const enrolledRupees = lead.enrollment_amount_cents ? Math.round(lead.enrollment_amount_cents / 100) : null
  const consentOk = state.consent?.state === 'given' && state.consent.amount_rupees === enrolledRupees
  const draftErr = paymentDraftError(draft)

  return (
    <div className="space-y-3">
      <p className="text-ds-caption text-muted-foreground">
        No deposit receipt on this enrollment yet{enrolledRupees ? ` (₹${enrolledRupees} paid)` : ''}.
      </p>
      <DepositConsentStep lead={lead} state={state} />
      {state.consent?.state === 'given' && !consentOk ? (
        <p className="text-ds-caption text-destructive">
          The lead agreed to ₹{state.consent.amount_rupees} but ₹{enrolledRupees} was paid. Send a new link for ₹
          {enrolledRupees}.
        </p>
      ) : null}
      {consentOk ? (
        <>
          <p className="text-ds-caption font-semibold text-foreground">Step 2 · Payment details</p>
          <PaymentDetailsFields value={draft} onChange={setDraft} modes={state.payment_modes} />
          {gen.error ? <p className="text-ds-caption text-destructive">{gen.error.message}</p> : null}
          <Button type="button" size="sm" disabled={!!draftErr || gen.isPending} onClick={() => gen.mutate(paymentDraftBody(draft))}>
            {gen.isPending ? 'Generating…' : 'Generate Receipt'}
          </Button>
        </>
      ) : null}
    </div>
  )
}

/** Button + sheet for a lead's deposit receipt (download, share, or generate). */
export function LeadDepositButton({ lead, className }: { lead: LeadLike; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline'}
      >
        <FileText className="size-3.5" aria-hidden /> Deposit receipt
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Deposit receipt" size="sm" className="space-y-3 p-5 text-sm">
        <h2 className="text-base font-semibold text-foreground">Security deposit · {lead.name}</h2>
        {open ? <LeadDepositBody lead={lead} /> : null}
      </Sheet>
    </>
  )
}

/** App-wide sheet: the receipt right after "Send to Day 1", ready to share with the lead. */
export function DepositReceiptHost() {
  const lead = useDepositReceiptStore((s) => s.lead)
  const close = useDepositReceiptStore((s) => s.close)
  return (
    <Sheet open={lead != null} onClose={close} label="Deposit receipt" size="sm" className="space-y-3 p-5 text-sm">
      {lead ? (
        <>
          <p className="flex items-center gap-1.5 font-semibold text-success-ink">
            <CheckCircle2 className="size-4" aria-hidden /> {lead.name} sent to Day 1
          </p>
          <p className="text-ds-caption text-muted-foreground">Share the security deposit receipt with the lead:</p>
          <LeadDepositBody lead={lead} />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
