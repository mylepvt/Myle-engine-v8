import { useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'

import type { CtcsAction } from '@/hooks/use-leads-query'
import { telHref, whatsAppChatHref } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

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
  /** Same as legacy call panel — show dial + WhatsApp next to outcome picks. */
  phone?: string | null
  busy: boolean
  onClose: () => void
  /** For ``call_later``, optional ISO follow-up time; omit for server default (+24h). */
  onPick: (action: CtcsAction, followupAt?: string | null) => void
}

export function CtcsOutcomeModal({ open, leadName, phone, busy, onClose, onPick }: Props) {
  const [step, setStep] = useState<'outcomes' | 'call_later_time'>('outcomes')
  const [localFollowup, setLocalFollowup] = useState(defaultCallLaterLocalInput)

  if (!open) return null

  const tel = telHref(phone)
  const wa = whatsAppChatHref(phone ?? '')
  const canDial = tel !== '#'
  const canWa = wa !== '#'

  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const minLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

  return (
    <div
      className="keyboard-safe-modal fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-3 backdrop-blur-sm sm:items-center dark:bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ctcs-outcome-title"
    >
      <div className="keyboard-safe-sheet w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl backdrop-blur-md">
        <h2 id="ctcs-outcome-title" className="text-lg font-semibold text-foreground">
          Call outcome
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{leadName}</p>

        {phone?.trim() ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
            <p className="font-mono text-sm text-foreground">{phone.trim()}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {canDial ? (
                <a
                  href={tel}
                  className={cn(
                    'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                    'border-2 border-emerald-600/45 bg-emerald-500/15 text-emerald-900 shadow-[0_0_12px_rgba(52,211,153,0.28)] hover:bg-emerald-500/25',
                    'dark:border-emerald-400/70 dark:bg-emerald-500/20 dark:text-emerald-100 dark:shadow-[0_0_12px_rgba(52,211,153,0.35)] dark:hover:bg-emerald-500/30',
                  )}
                >
                  <Phone className="size-4 shrink-0" aria-hidden />
                  Dial
                </a>
              ) : null}
              {canWa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                    'border-2 border-[#128C7E]/55 bg-[#25D366]/14 text-[#065f46] shadow-[0_0_12px_rgba(37,211,102,0.28)] hover:bg-[#25D366]/22',
                    'dark:border-[#25D366]/75 dark:bg-[#25D366]/20 dark:text-[#e8ffe8] dark:shadow-[0_0_12px_rgba(37,211,102,0.35)] dark:hover:bg-[#25D366]/30',
                  )}
                >
                  <MessageCircle className="size-4 shrink-0" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

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
                className="min-h-12 rounded-xl border border-border bg-muted/50 px-4 py-3 text-left text-base font-medium text-foreground transition hover:border-primary/40 hover:bg-muted disabled:opacity-50"
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
              className="field-input min-h-12 w-full rounded-xl px-3 text-base"
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
              className="min-h-11 w-full rounded-xl border border-border bg-muted/30 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              Use default (24h)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('outcomes')}
              className="min-h-11 w-full rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              className="mt-1 w-full min-h-11 rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-muted/40"
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
            className="mt-3 w-full min-h-11 rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-muted/40"
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
