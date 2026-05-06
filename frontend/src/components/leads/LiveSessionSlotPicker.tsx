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
    if (!open) {
      setSelectedHour(null)
    }
  }, [open])

  if (!open) return null

  const options = scheduleQuery.data ?? []
  const selectedOption = options.find((option) => option.hour === selectedHour) ?? null
  const canConfirm = !!selectedOption && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[1.6rem] border border-white/10 bg-[#0a1020] p-5 shadow-[0_32px_120px_-70px_rgba(0,0,0,0.95)]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Sent Enroll Video</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Choose which time slot to send</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Existing Live Session schedule me se sirf next available slots yahan dikh rahe hain.
        </p>

        <div className="mt-4 space-y-2">
          {scheduleQuery.isPending ? (
            <p className="text-sm text-white/60">Loading available slots…</p>
          ) : scheduleQuery.isError ? (
            <p className="text-sm text-red-300">Could not load live session slots.</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-amber-200">
              Abhi next live-session slots available nahi hain. Live Session schedule check karo.
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.hour}
                type="button"
                onClick={() => setSelectedHour(option.hour)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedHour === option.hour
                    ? 'border-primary/50 bg-primary/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{option.label}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                    {option.state === 'waiting' ? 'Starting soon' : 'Upcoming'}
                  </span>
                </div>
                <p className="mt-1 break-all text-xs text-white/50">{option.link}</p>
              </button>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => selectedOption && onConfirm(selectedOption)} disabled={!canConfirm}>
            {busy ? 'Sending…' : 'Send selected video'}
          </Button>
        </div>
      </div>
    </div>
  )
}
