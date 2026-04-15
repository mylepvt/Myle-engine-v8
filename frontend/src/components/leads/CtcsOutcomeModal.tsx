import type { CtcsAction } from '@/hooks/use-leads-query'

const OPTIONS: { action: CtcsAction; label: string }[] = [
  { action: 'not_picked', label: 'Not Picked' },
  { action: 'interested', label: 'Interested' },
  { action: 'call_later', label: 'Call Later' },
  { action: 'not_interested', label: 'Not Interested' },
  { action: 'paid', label: 'Paid' },
]

type Props = {
  open: boolean
  leadName: string
  busy: boolean
  onClose: () => void
  onPick: (action: CtcsAction) => void
}

export function CtcsOutcomeModal({ open, leadName, busy, onClose, onPick }: Props) {
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
        <div className="mt-4 grid grid-cols-1 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.action}
              type="button"
              disabled={busy}
              onClick={() => onPick(o.action)}
              className="min-h-12 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-left text-base font-medium text-foreground transition hover:border-primary/40 hover:bg-white/[0.1] disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 w-full min-h-11 rounded-xl border border-white/10 py-2 text-sm text-muted-foreground"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
