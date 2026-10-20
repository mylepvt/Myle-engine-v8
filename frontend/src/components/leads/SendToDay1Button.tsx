import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { DepositConsentStep } from '@/components/deposits/DepositConsentStep'
import { PaymentDetailsFields } from '@/components/deposits/PaymentDetailsFields'
import { emptyPaymentDraft, paymentDraftBody, paymentDraftError } from '@/lib/deposits'
import { cn } from '@/lib/utils'
import { depositKeys, useLeadDepositQuery } from '@/hooks/use-deposits-query'
import { useDepositReceiptStore } from '@/stores/deposit-receipt-store'
import {
  ENROLLMENT_MAX_RUPEES,
  ENROLLMENT_MIN_RUPEES,
  type LeadPublic,
  useSendToDay1Mutation,
} from '@/hooks/use-leads-query'

/**
 * Team: the prospect's enrollment is a refundable security deposit (₹149–200).
 * 1. The lead agrees on their own phone (consent link on WhatsApp).
 * 2. After they pay: payment mode, Transaction ID, time and screenshot → a deposit receipt
 *    is issued and the lead goes to the leader's Day 1. The receipt can then be shared.
 */
export function SendToDay1Button({ lead, className }: { lead: LeadPublic; className?: string }) {
  const qc = useQueryClient()
  const mut = useSendToDay1Mutation()
  const showReceipt = useDepositReceiptStore((s) => s.show)
  const [open, setOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState(emptyPaymentDraft)
  const deposit = useLeadDepositQuery(lead.id, open)

  const state = deposit.data
  const gateOn = state?.gate_enabled ?? true
  const consent = state?.consent
  const consentGiven = consent?.state === 'given'
  // With consent given, the amount is what the lead agreed to.
  const amount = gateOn && consentGiven ? consent.amount_rupees : Number.parseInt(amountStr, 10)
  const amountOk = Number.isFinite(amount) && amount >= ENROLLMENT_MIN_RUPEES && amount <= ENROLLMENT_MAX_RUPEES
  const draftErr = paymentDraftError(draft)
  const paymentOk = gateOn ? !draftErr : true
  const canSubmit = !!state && (!gateOn || consentGiven) && amountOk && paymentOk && !!file && !mut.isPending

  const openSheet = () => {
    // Reset on open, not close, so the form doesn't blank out while it animates away.
    setAmountStr('')
    setFile(null)
    setDraft(emptyPaymentDraft())
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
          'flex h-8 items-center gap-1 rounded-full bg-success/10 px-2.5 text-ds-caption font-semibold text-success-ink transition hover:bg-success/20 active:scale-95',
          className,
        )}
        title="Lead's deposit consent, payment details and screenshot — then Day 1"
      >
        <ArrowRightCircle className="size-3.5" aria-hidden />
        Send to Day 1
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
          <h2 className="text-base font-semibold text-foreground">Send {lead.name} to Day 1</h2>
          <p className="mt-1 text-ds-caption text-muted-foreground">
            The enrollment payment (₹{ENROLLMENT_MIN_RUPEES}–₹{ENROLLMENT_MAX_RUPEES}) is a 100% refundable security
            deposit. A receipt is issued, and the lead goes to your leader&apos;s Day 1.
          </p>
        </div>

        {deposit.isPending ? <p className="text-ds-caption text-muted-foreground">Loading…</p> : null}
        {deposit.isError ? <p className="text-ds-caption text-destructive">{deposit.error.message}</p> : null}

        {state ? (
          <>
            {gateOn ? <DepositConsentStep lead={lead} state={state} /> : null}

            {!gateOn || consentGiven ? (
              <>
                {gateOn ? <p className="text-ds-caption font-semibold text-foreground">Step 2 · Payment</p> : null}
                {gateOn && consentGiven ? (
                  <p className="text-ds-caption text-muted-foreground">Amount: ₹{consent.amount_rupees}</p>
                ) : (
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
                  </>
                )}

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
              </>
            ) : null}

            {mut.error ? <p className="text-ds-caption text-destructive">{mut.error.message}</p> : null}

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
                      onSuccess: () => {
                        setOpen(false)
                        // The lead leaves this board now; the receipt opens app-wide.
                        if (gateOn) {
                          qc.removeQueries({ queryKey: depositKeys.lead(lead.id) })
                          showReceipt({ id: lead.id, name: lead.name, phone: lead.phone })
                        }
                      },
                    },
                  )
                }}
              >
                {mut.isPending ? 'Sending…' : 'Send to Day 1'}
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  )
}
