import { useState } from 'react'
import { ArrowRightCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ENROLLMENT_MAX_RUPEES,
  ENROLLMENT_MIN_RUPEES,
  type LeadPublic,
  useSendToDay1Mutation,
} from '@/hooks/use-leads-query'

/**
 * Team: after the prospect pays the enrollment (₹149–200), upload the payment
 * screenshot — the lead then goes to the leader's Day 1.
 */
export function SendToDay1Button({ lead, className }: { lead: LeadPublic; className?: string }) {
  const mut = useSendToDay1Mutation()
  const [open, setOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const amount = Number.parseInt(amountStr, 10)
  const amountOk = Number.isFinite(amount) && amount >= ENROLLMENT_MIN_RUPEES && amount <= ENROLLMENT_MAX_RUPEES

  const close = () => {
    if (mut.isPending) return
    setOpen(false)
    setAmountStr('')
    setFile(null)
    mut.reset()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-8 items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2.5 text-ds-caption font-semibold text-success-ink transition hover:bg-success/20 active:scale-95',
          className,
        )}
        title="Upload enrollment screenshot and send to Day 1"
      >
        <ArrowRightCircle className="size-3.5" aria-hidden />
        Send to Day 1
      </button>

      {open ? (
        <div
          className="keyboard-safe-modal fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Send to Day 1"
        >
          <div
            className="keyboard-safe-sheet surface-elevated w-full max-w-sm space-y-3 rounded p-5 text-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-foreground">Send {lead.name} to Day 1</h2>
              <p className="mt-1 text-ds-caption text-muted-foreground">
                Upload the enrollment payment screenshot (₹{ENROLLMENT_MIN_RUPEES}–₹{ENROLLMENT_MAX_RUPEES}). The lead
                then goes to your leader&apos;s Day 1. Your leader will check the screenshot.
              </p>
            </div>

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

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" disabled={mut.isPending} onClick={close}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!amountOk || !file || mut.isPending}
                onClick={() => {
                  if (!file) return
                  mut.mutate({ leadId: lead.id, amountRupees: amount, screenshot: file }, { onSuccess: close })
                }}
              >
                {mut.isPending ? 'Sending…' : 'Send to Day 1'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
