import { useEffect, useMemo, useState } from 'react'

import type { CtcsAction } from '@/hooks/use-leads-query'

const OPTIONS: { action: CtcsAction; label: string }[] = [
  { action: 'not_picked', label: 'Not Picked' },
  { action: 'interested', label: 'Interested' },
  { action: 'call_later', label: 'Call Later' },
  { action: 'not_interested', label: 'Not Interested' },
  { action: 'paid', label: 'Paid' },
]

function defaultCallLaterLocalInput(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Props = {
  open: boolean
  leadName: string
  busy: boolean
  onClose: () => void
  /** For ``call_later``, optional ISO follow-up time; omit for server default (+24h). */
  onPick: (action: CtcsAction, followupAt?: string | null) => void
}

export function CtcsOutcomeModal({ open, leadName, busy, onClose, onPick }: Props) {
  const [step, setStep] = useState<'outcomes' | 'call_later_time'>('outcomes')
  const [localFollowup, setLocalFollowup] = useState(defaultCallLaterLocalInput)

  useEffect(() => {
    if (!open) {
      setStep('outcomes')
    }
  }, [open])

  const minLocal = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }, [open, step])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ctcs-outcome-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-zinc-950 p-4 shadow-xl">
        <h2 id="ctcs-outcome-title" className="text-lg font-semibold text-foreground">
          Call outcome
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{leadName}</p>

        {step === 'outcomes' ? (
          <div className="mt-4 grid grid-cols-1 gap-2">
            {OPTIONS.map((o) => (
              <button
                key={o.action}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (o.action === 'call_later') {
                    setLocalFollowup(defaultCallLaterLocalInput())
                    setStep('call_later_time')
                    return
                  }
                  onPick(o.action)
                }}
                className="min-h-12 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-left text-base font-medium text-foreground transition hover:border-primary/40 hover:bg-white/[0.1] disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">When should we call again?</p>
            <input
              type="datetime-local"
              aria-label="Follow-up date and time"
              title="Follow-up date and time"
              className="min-h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-base text-foreground"
              min={minLocal}
              value={localFollowup}
              onChange={(e) => setLocalFollowup(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const iso = new Date(localFollowup).toISOString()
                onPick('call_later', iso)
              }}
              className="min-h-12 w-full rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
            >
              Schedule
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick('call_later')}
              className="min-h-11 w-full rounded-xl border border-white/15 py-2 text-sm font-medium text-foreground disabled:opacity-50"
            >
              Use default (24h)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('outcomes')}
              className="min-h-11 w-full rounded-xl border border-white/10 py-2 text-sm text-muted-foreground disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              className="mt-1 w-full min-h-11 rounded-xl border border-white/10 py-2 text-sm text-muted-foreground"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        )}

        {step === 'outcomes' ? (
          <button
            type="button"
            className="mt-3 w-full min-h-11 rounded-xl border border-white/10 py-2 text-sm text-muted-foreground"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  )
}
