import { useState } from 'react'
import { CheckCircle2, Clock, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatIst } from '@/lib/deposits'
import { shareConsentOnWhatsApp } from '@/lib/deposit-share'
import { type LeadDepositState, useCreateConsentLinkMutation } from '@/hooks/use-deposits-query'

type LeadLike = { id: number; name?: string | null; phone?: string | null }

/**
 * Step 1 of an enrollment: the lead agrees to the refundable deposit on their own phone.
 * The member sends the link on WhatsApp; this updates by itself once the lead agrees.
 */
export function DepositConsentStep({ lead, state }: { lead: LeadLike; state: LeadDepositState }) {
  const mut = useCreateConsentLinkMutation(lead.id)
  const consent = state.consent
  const [amountStr, setAmountStr] = useState(consent ? String(consent.amount_rupees) : '196')
  const [changing, setChanging] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const amount = Number.parseInt(amountStr, 10)
  const amountOk = Number.isFinite(amount) && amount >= state.min_rupees && amount <= state.max_rupees

  if (consent?.state === 'given' && !changing) {
    return (
      <div className="flex items-start gap-2 rounded-2xl bg-success/10 p-3 text-ds-caption">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Consent given for ₹{consent.amount_rupees}</p>
          <p className="text-muted-foreground">
            {consent.typed_name} agreed on {formatIst(consent.given_at)}.
          </p>
        </div>
        <button type="button" className="text-primary hover:underline" onClick={() => setChanging(true)}>
          Different amount?
        </button>
      </div>
    )
  }

  if (consent?.state === 'pending' && !changing) {
    return (
      <div className="space-y-2 rounded-2xl bg-warning/15 p-3 text-ds-caption">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <Clock className="size-4 text-warning-ink" aria-hidden /> Waiting for {lead.name || 'the lead'} to agree (₹
          {consent.amount_rupees})
        </p>
        <p className="text-muted-foreground">
          The lead opens the link, enters their mobile number, reads the terms and agrees. This updates by itself. The
          link works until {formatIst(consent.expires_at)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setErr(null)
              try {
                if (consent.token) shareConsentOnWhatsApp(lead, consent.amount_rupees, consent.token)
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not open WhatsApp')
              }
            }}
          >
            <MessageCircle className="size-3.5" aria-hidden /> Send link again
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(true)}>
            Change amount
          </Button>
        </div>
        {err ? <p className="text-destructive">{err}</p> : null}
      </div>
    )
  }

  const note =
    consent?.state === 'withdrawn'
      ? 'The lead withdrew their consent. Send a new link only if they want to continue.'
      : consent?.state === 'expired'
        ? 'The last link expired before the lead agreed. Send a new one.'
        : null

  return (
    <div className="space-y-2 rounded-2xl bg-muted/60 p-3 text-ds-caption">
      <p className="font-semibold text-foreground">Step 1 · Lead&apos;s consent</p>
      <p className="text-muted-foreground">
        Before the lead pays, they must agree on their own phone that this is a 100% refundable security deposit — not a
        product purchase or fee.
      </p>
      {note ? <p className="text-destructive">{note}</p> : null}
      <label className="block">
        <span className="mb-1 block text-muted-foreground">Deposit amount (₹)</span>
        <input
          type="number"
          inputMode="numeric"
          min={state.min_rupees}
          max={state.max_rupees}
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="field-input"
        />
      </label>
      {amountStr !== '' && !amountOk ? (
        <p className="text-destructive">
          Amount must be between ₹{state.min_rupees} and ₹{state.max_rupees}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!amountOk || mut.isPending}
          onClick={() => {
            setErr(null)
            mut.mutate(amount, {
              onSuccess: (data) => {
                setChanging(false)
                const token = data.consent?.token
                try {
                  if (token) shareConsentOnWhatsApp(lead, amount, token)
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Could not open WhatsApp')
                }
              },
            })
          }}
        >
          <MessageCircle className="size-3.5" aria-hidden />
          {mut.isPending ? 'Creating link…' : 'Send consent link on WhatsApp'}
        </Button>
        {changing ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {mut.error ? <p className="text-destructive">{mut.error.message}</p> : null}
      {err ? <p className="text-destructive">{err}</p> : null}
    </div>
  )
}
