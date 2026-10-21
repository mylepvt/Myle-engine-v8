import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRightCircle, CheckCircle2, Clock, Image as ImageIcon, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { PaymentDetailsFields } from '@/components/deposits/PaymentDetailsFields'
import { shareEnrollmentOnWhatsApp } from '@/lib/deposit-share'
import { emptyPaymentDraft, formatIst, paymentDraftBody, paymentDraftError } from '@/lib/deposits'
import { cn } from '@/lib/utils'
import {
  type DepositConsent,
  depositKeys,
  fetchLeadDeposit,
  useApproveRegistrationMutation,
  useLeadDepositQuery,
} from '@/hooks/use-deposits-query'
import { useDepositReceiptStore } from '@/stores/deposit-receipt-store'
import {
  ENROLLMENT_MAX_RUPEES,
  ENROLLMENT_MIN_RUPEES,
  type LeadPublic,
  useSendToDay1Mutation,
} from '@/hooks/use-leads-query'

type LeadLike = { id: number; name?: string | null; phone?: string | null }

/** An enrollment link that is still waiting on the prospect (or on a leader's check). */
function openLink(consent: DepositConsent | null | undefined): DepositConsent | null {
  if (!consent?.registration_stage || consent.registration_stage === 'done') return null
  return consent.state === 'pending' || consent.state === 'given' ? consent : null
}

function EnrollmentLinkStatus({
  lead,
  consent,
  canApprove,
  onReupload,
}: {
  lead: LeadLike
  consent: DepositConsent
  canApprove: boolean
  onReupload: () => void
}) {
  const approve = useApproveRegistrationMutation(lead.id)
  const [err, setErr] = useState<string | null>(null)
  const name = lead.name || 'The prospect'
  const mismatch = consent.registration_stage === 'mismatch'

  return (
    <div className={cn('space-y-2 rounded-2xl p-3 text-ds-caption', mismatch ? 'bg-destructive/10' : 'bg-warning/15')}>
      {mismatch ? (
        <>
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <AlertTriangle className="size-4 text-destructive" aria-hidden /> Screenshot didn&apos;t match
          </p>
          <p className="text-muted-foreground">{consent.match_detail}</p>
          <div className="flex flex-wrap gap-3">
            {consent.member_proof_url ? (
              <a href={consent.member_proof_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ImageIcon className="size-3.5" aria-hidden /> Upline&apos;s screenshot
              </a>
            ) : null}
            {consent.prospect_proof_url ? (
              <a href={consent.prospect_proof_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ImageIcon className="size-3.5" aria-hidden /> Prospect&apos;s screenshot
              </a>
            ) : null}
          </div>
          {consent.reg_name ? (
            <p className="text-muted-foreground">
              Registered as {consent.reg_name} · {consent.reg_email} · {consent.reg_phone}
            </p>
          ) : null}
          {canApprove ? (
            <Button type="button" size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
              <CheckCircle2 className="size-3.5" aria-hidden />
              {approve.isPending ? 'Approving…' : 'Checked, approve enrollment'}
            </Button>
          ) : (
            <p className="text-muted-foreground">Your leader has been told and will check it.</p>
          )}
          {approve.error ? <p className="text-destructive">{approve.error.message}</p> : null}
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <Clock className="size-4 text-warning-ink" aria-hidden />
            {consent.state === 'given' ? `${name} agreed, waiting for the registration form` : `Waiting for ${name} to agree and register`}
          </p>
          <p className="text-muted-foreground">
            Once they register with the same payment screenshot, the receipt is issued, the lead goes to your
            leader&apos;s Day 1 and their welcome email goes out. The link works until {formatIst(consent.expires_at)}.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {consent.token ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setErr(null)
              try {
                shareEnrollmentOnWhatsApp(lead, consent.token as string)
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not open WhatsApp')
              }
            }}
          >
            <MessageCircle className="size-3.5" aria-hidden /> Send link again
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onReupload}>
          Upload again
        </Button>
      </div>
      {err ? <p className="text-destructive">{err}</p> : null}
    </div>
  )
}

/**
 * Team: the prospect's enrollment is a refundable security deposit (₹149–200).
 * 1. After the prospect pays: amount, payment mode, Transaction ID, time and screenshot.
 * 2. WhatsApp opens with the prospect's link: they agree, then register (name, email,
 *    mobile, the same screenshot). A match issues the receipt, moves the lead to the
 *    leader's Day 1 and sends the welcome email. A mismatch waits for a leader's check.
 * With the deposit gate off (emergency), the upload sends the lead to Day 1 directly.
 */
export function SendToDay1Button({
  lead,
  className,
  canApprove = false,
}: {
  lead: LeadPublic
  className?: string
  canApprove?: boolean
}) {
  const qc = useQueryClient()
  const mut = useSendToDay1Mutation()
  const showReceipt = useDepositReceiptStore((s) => s.show)
  const [open, setOpen] = useState(false)
  const [reupload, setReupload] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState(emptyPaymentDraft)
  const [shareErr, setShareErr] = useState<string | null>(null)
  const deposit = useLeadDepositQuery(lead.id, open)

  const state = deposit.data
  const gateOn = state?.gate_enabled ?? true
  const waiting = gateOn ? openLink(state?.consent) : null
  const amount = Number.parseInt(amountStr, 10)
  const amountOk = Number.isFinite(amount) && amount >= ENROLLMENT_MIN_RUPEES && amount <= ENROLLMENT_MAX_RUPEES
  const paymentOk = gateOn ? !paymentDraftError(draft) : true
  const canSubmit = !!state && amountOk && paymentOk && !!file && !mut.isPending
  const awaitingProspect = !!lead.enrollment_proof_uploaded_at

  const openSheet = () => {
    // Reset on open, not close, so the form doesn't blank out while it animates away.
    setAmountStr('')
    setFile(null)
    setDraft(emptyPaymentDraft())
    setReupload(false)
    setShareErr(null)
    mut.reset()
    setOpen(true)
  }
  const close = () => {
    if (mut.isPending) return
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={cn(
          'flex h-8 items-center gap-1 rounded-full px-2.5 text-ds-caption font-semibold transition active:scale-95',
          awaitingProspect ? 'bg-warning/15 text-warning-ink hover:bg-warning/25' : 'bg-success/10 text-success-ink hover:bg-success/20',
          className,
        )}
        title="Upload the enrollment payment, then the prospect agrees and registers"
      >
        {awaitingProspect ? <Clock className="size-3.5" aria-hidden /> : <ArrowRightCircle className="size-3.5" aria-hidden />}
        {awaitingProspect ? 'Waiting for prospect' : 'Send to Day 1'}
      </button>

      {/* Sheet portals to <body>: the calling-board card uses backdrop-blur + overflow-hidden,
          which traps a `position: fixed` child inside the card. */}
      <Sheet
        open={open}
        onClose={close}
        label="Send to Day 1"
        size="sm"
        dismissible={!mut.isPending}
        className="space-y-3 p-5 text-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">Enroll {lead.name}</h2>
          <p className="mt-1 text-ds-caption text-muted-foreground">
            {gateOn
              ? `Upload the payment (₹${ENROLLMENT_MIN_RUPEES}–₹${ENROLLMENT_MAX_RUPEES}). ${lead.name || 'The prospect'} then gets a link on WhatsApp to agree and register; after that the lead goes to your leader's Day 1.`
              : `The enrollment payment (₹${ENROLLMENT_MIN_RUPEES}–₹${ENROLLMENT_MAX_RUPEES}) is a security deposit. The lead goes to your leader's Day 1.`}
          </p>
        </div>

        {deposit.isPending ? <p className="text-ds-caption text-muted-foreground">Loading…</p> : null}
        {deposit.isError ? <p className="text-ds-caption text-destructive">{deposit.error.message}</p> : null}

        {state && waiting && !reupload ? (
          <EnrollmentLinkStatus lead={lead} consent={waiting} canApprove={canApprove} onReupload={() => setReupload(true)} />
        ) : null}

        {state && (!waiting || reupload) ? (
          <>
            <label className="block">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Amount paid (₹)</span>
              <input
                type="number"
                inputMode="numeric"
                min={ENROLLMENT_MIN_RUPEES}
                max={ENROLLMENT_MAX_RUPEES}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder={`${ENROLLMENT_MIN_RUPEES}–${ENROLLMENT_MAX_RUPEES}`}
                className="field-input"
              />
            </label>
            {amountStr !== '' && !amountOk ? (
              <p className="text-ds-caption text-destructive">
                Amount must be between ₹{ENROLLMENT_MIN_RUPEES} and ₹{ENROLLMENT_MAX_RUPEES}.
              </p>
            ) : null}

            {gateOn ? <PaymentDetailsFields value={draft} onChange={setDraft} modes={state.payment_modes} /> : null}

            <label className="block">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Payment screenshot</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-ds-caption text-foreground"
              />
            </label>

            {mut.error ? <p className="text-ds-caption text-destructive">{mut.error.message}</p> : null}
            {shareErr ? <p className="text-ds-caption text-destructive">{shareErr}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" disabled={mut.isPending} onClick={close}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit}
                onClick={() => {
                  if (!file) return
                  mut.mutate(
                    {
                      leadId: lead.id,
                      amountRupees: amount,
                      screenshot: file,
                      payment: gateOn ? paymentDraftBody(draft) : null,
                    },
                    {
                      onSuccess: async () => {
                        if (!gateOn) {
                          setOpen(false)
                          return
                        }
                        // The prospect's link: open WhatsApp with it ready to send.
                        const fresh = await qc.fetchQuery({
                          queryKey: depositKeys.lead(lead.id),
                          queryFn: () => fetchLeadDeposit(lead.id),
                        })
                        setReupload(false)
                        const token = fresh.consent?.token
                        if (!token) return
                        try {
                          shareEnrollmentOnWhatsApp(lead, token)
                        } catch (e) {
                          setShareErr(e instanceof Error ? e.message : 'Could not open WhatsApp')
                        }
                      },
                    },
                  )
                }}
              >
                {mut.isPending ? 'Uploading…' : gateOn ? 'Upload & send link' : 'Send to Day 1'}
              </Button>
            </div>
          </>
        ) : null}

        {state?.receipt && !waiting ? (
          <Button type="button" size="sm" variant="outline" onClick={() => showReceipt({ id: lead.id, name: lead.name, phone: lead.phone })}>
            View receipt
          </Button>
        ) : null}
      </Sheet>
    </>
  )
}
