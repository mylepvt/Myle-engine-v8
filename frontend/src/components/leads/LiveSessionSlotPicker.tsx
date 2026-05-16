import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchUpcomingLiveSessionSlots, type LiveSessionSlotOption } from '@/lib/live-session-slots'

type Props = {
  open: boolean
  busy?: boolean
  day?: number
  onClose: () => void
  onConfirm: (option: LiveSessionSlotOption, useBusinessWhatsApp?: boolean) => void
}

export function LiveSessionSlotPicker({ open, busy = false, day = 1, onClose, onConfirm }: Props) {
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [useBusinessWhatsApp, setUseBusinessWhatsApp] = useState(false)
  const scheduleQuery = useQuery({
    queryKey: ['premiere', 'schedule', 'picker', day],
    queryFn: () => fetchUpcomingLiveSessionSlots(day),
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[#0d1526] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
        style={{
          background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%), #0d1526',
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-[#7a94c4]">
            Day {day} Live Session
          </p>
          <h3 className="mt-1 text-[18px] font-bold text-white">Choose a time slot</h3>
          <p className="mt-1 text-[12px] text-[#7a94c4]">Link will open in WhatsApp for {day === 1 ? 'Day 2' : `Day ${day}`} session</p>
        </div>

        <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]" />

        {/* Slot cards */}
        <div className="px-4 py-4 space-y-2">
          {scheduleQuery.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-2xl border border-white/[0.06] bg-white/[0.025] animate-pulse" />
              ))}
            </div>
          ) : scheduleQuery.isError ? (
            <p className="text-center text-sm text-red-300 py-4">Slots load nahi ho sake. Retry karo.</p>
          ) : options.length === 0 ? (
            <p className="text-center text-sm text-amber-200/80 py-4">Aaj ke liye koi upcoming slot nahi hai.</p>
          ) : (
            options.map((opt) => {
              const selected = effectiveHour === opt.hour
              const isLive = opt.state === 'live'
              const isWaiting = opt.state === 'waiting'
              return (
                <button
                  key={opt.hour}
                  type="button"
                  onClick={() => setSelectedHour(opt.hour)}
                  className="w-full rounded-2xl border px-4 py-3.5 text-left transition-all"
                  style={{
                    background: selected
                      ? isLive ? 'rgba(239,68,68,0.08)' : 'rgba(142,176,255,0.08)'
                      : 'rgba(255,255,255,0.025)',
                    borderColor: selected
                      ? isLive ? 'rgba(239,68,68,0.35)' : 'rgba(142,176,255,0.35)'
                      : 'rgba(255,255,255,0.07)',
                    boxShadow: selected
                      ? isLive ? '0 0 0 1px rgba(239,68,68,0.15)' : '0 0 0 1px rgba(142,176,255,0.12)'
                      : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Selection dot */}
                      <span
                        className="size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          borderColor: selected
                            ? isLive ? '#ef4444' : '#8eb0ff'
                            : 'rgba(255,255,255,0.2)',
                          background: selected
                            ? isLive ? '#ef4444' : '#8eb0ff'
                            : 'transparent',
                        }}
                      >
                        {selected && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold text-white tabular-nums">{opt.label}</p>
                        {opt.link && (
                          <p className="mt-0.5 text-[10px] text-[#7a94c4] truncate max-w-[160px]">{opt.link}</p>
                        )}
                      </div>
                    </div>

                    {/* State badge */}
                    <div className="flex items-center gap-1.5">
                      {isLive ? (
                        <span className="flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-300">
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                          </span>
                          Live
                        </span>
                      ) : isWaiting ? (
                        <span className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-300">
                          Soon
                        </span>
                      ) : opt.state === 'past' ? (
                        <span className="text-[10px] text-white/30">Done</span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.025] px-2.5 py-1 text-[10px] font-medium text-[#7a94c4]">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)]" />

        {/* Footer */}
        <div className="px-4 pb-5 pt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className="relative"
              onClick={() => setUseBusinessWhatsApp(v => !v)}
            >
              <div
                className="h-5 w-9 rounded-full transition-all"
                style={{
                  background: useBusinessWhatsApp ? '#22c55e' : 'rgba(255,255,255,0.12)',
                }}
              />
              <div
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                style={{ left: useBusinessWhatsApp ? '20px' : '2px' }}
              />
            </div>
            <span className="text-[13px] text-[#b8c7e6]">WhatsApp Business</span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-11 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[13px] font-semibold text-white/70 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => effectiveOption && onConfirm(effectiveOption, useBusinessWhatsApp)}
              className="flex-1 h-11 rounded-2xl text-[13px] font-bold transition disabled:opacity-40"
              style={{
                background: canConfirm
                  ? 'linear-gradient(180deg, #fafbff 0%, #e6ecf8 100%)'
                  : 'rgba(255,255,255,0.08)',
                color: canConfirm ? '#07142e' : '#7a94c4',
                boxShadow: canConfirm ? '0 8px 24px -8px rgba(142,176,255,0.4)' : undefined,
              }}
            >
              {busy ? 'Sending…' : 'Send link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
