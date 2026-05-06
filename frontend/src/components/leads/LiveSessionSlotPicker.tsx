import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { fetchUpcomingLiveSessionSlots, type LiveSessionSlotOption } from '@/lib/live-session-slots'

type Props = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (option: LiveSessionSlotOption) => void
}

export function LiveSessionSlotPicker({ open, busy = false, onClose, onConfirm }: Props) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const scheduleQuery = useQuery({
    queryKey: ['premiere', 'schedule', 'picker'],
    queryFn: fetchUpcomingLiveSessionSlots,
    enabled: open,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!open) setSelectedHour(null)
  }, [open])

  if (!open) return null

  const options = scheduleQuery.data ?? []
  const effectiveHour = selectedHour ?? options[0]?.hour ?? null
  const effectiveOption = options.find((o) => o.hour === effectiveHour) ?? null
  const canConfirm = !!effectiveOption && !busy

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#0d1526] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary/70">
          Sent Enroll Video
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-white">Choose session slot</h3>

        <div className="mt-4">
          {scheduleQuery.isPending ? (
            <p className="text-sm text-white/50">Loading…</p>
          ) : scheduleQuery.isError ? (
            <p className="text-sm text-red-300">Could not load slots.</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-amber-200/80">No upcoming slots available.</p>
          ) : (
            <select
              className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-3 text-sm font-medium text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={effectiveHour ?? ''}
              onChange={(e) => setSelectedHour(Number(e.target.value))}
            >
              {options.map((opt) => (
                <option key={opt.hour} value={opt.hour}>
                  {opt.label}{opt.state === 'waiting' ? ' — Soon' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {effectiveOption && (
          <p className="mt-2 truncate text-[0.65rem] text-white/30">{effectiveOption.link}</p>
        )}

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!canConfirm}
            onClick={() => effectiveOption && onConfirm(effectiveOption)}
          >
            {busy ? 'Sending…' : 'Send video'}
          </Button>
        </div>
      </div>
    </div>
  )
}
