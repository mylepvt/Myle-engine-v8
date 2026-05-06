import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { fetchUpcomingLiveSessionSlots, type LiveSessionSlotOption } from '@/lib/live-session-slots'

const ITEM_H = 52 // px — height of each wheel row

function haptic() {
  try { navigator.vibrate?.(8) } catch { /* ignore */ }
}

function WheelPicker({
  options,
  value,
  onChange,
}: {
  options: LiveSessionSlotOption[]
  value: number | null
  onChange: (hour: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastIndex = useRef(-1)
  const rafId = useRef<number | null>(null)

  // Scroll to selected item on first render / when options load
  useEffect(() => {
    const el = ref.current
    if (!el || options.length === 0) return
    const idx = value != null ? options.findIndex((o) => o.hour === value) : 0
    const target = Math.max(0, idx) * ITEM_H
    el.scrollTop = target
    lastIndex.current = Math.max(0, idx)
  }, [options]) // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const el = ref.current
    if (!el) return
    if (rafId.current != null) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      const idx = Math.round(el.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(idx, options.length - 1))
      if (clamped !== lastIndex.current && options[clamped]) {
        lastIndex.current = clamped
        haptic()
        onChange(options[clamped].hour)
      }
    })
  }

  return (
    <div className="relative overflow-hidden" style={{ height: ITEM_H * 3 }}>
      {/* selection band */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-xl border border-white/10 bg-white/[0.07]"
        style={{ top: ITEM_H, height: ITEM_H }}
      />
      {/* top fade */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20"
        style={{ height: ITEM_H, background: 'linear-gradient(to bottom, #0d1526 60%, transparent)' }}
      />
      {/* bottom fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
        style={{ height: ITEM_H, background: 'linear-gradient(to top, #0d1526 60%, transparent)' }}
      />

      <div
        ref={ref}
        onScroll={onScroll}
        className="snap-y snap-mandatory overflow-y-scroll"
        style={{
          height: ITEM_H * 3,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {/* top spacer */}
        <div style={{ height: ITEM_H, flexShrink: 0 }} />

        {options.map((opt, i) => {
          const isCenter = lastIndex.current === i
          return (
            <div
              key={opt.hour}
              className="snap-center flex items-center justify-center px-4 transition-all duration-150"
              style={{ height: ITEM_H, flexShrink: 0 }}
            >
              <span
                className={`text-center text-[0.95rem] font-semibold leading-tight transition-all duration-150 ${
                  isCenter ? 'scale-105 text-white' : 'scale-95 text-white/35'
                }`}
              >
                {opt.label}
                {opt.state === 'waiting' && (
                  <span className="ml-1.5 text-[0.65rem] font-normal text-primary/80">Soon</span>
                )}
              </span>
            </div>
          )
        })}

        {/* bottom spacer */}
        <div style={{ height: ITEM_H, flexShrink: 0 }} />
      </div>
    </div>
  )
}

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-t-[1.6rem] border border-white/10 bg-[#0d1526] shadow-2xl"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pt-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary/70">
            Sent Enroll Video
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-white">Choose session slot</h3>
        </div>

        <div className="mt-4 px-4">
          {scheduleQuery.isPending ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-white/50">Loading slots…</p>
            </div>
          ) : scheduleQuery.isError ? (
            <p className="px-1 text-sm text-red-300">Could not load slots.</p>
          ) : options.length === 0 ? (
            <p className="px-1 text-sm text-amber-200/80">No upcoming slots available.</p>
          ) : (
            <WheelPicker
              options={options}
              value={effectiveHour}
              onChange={(h) => setSelectedHour(h)}
            />
          )}
        </div>

        {effectiveOption && (
          <p className="mt-1 truncate px-5 text-[0.65rem] text-white/30">
            {effectiveOption.link}
          </p>
        )}

        <div className="mt-4 flex gap-2 px-5">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={busy}
          >
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
