import { useEffect, useRef, useState } from 'react'

import { formatCountdown } from '@/lib/ctcs-timer'
import { formatLeadSlaTime, leadSlaClockAngles, leadSlaTone } from '@/lib/lead-sla'
import { cn } from '@/lib/utils'

/**
 * Lead SLA clock + "time left" text that runs on its own, butter-smooth:
 * - hands sweep on every animation frame (requestAnimationFrame) by writing the SVG
 *   transforms directly — no React re-render, so nothing else on the board redraws;
 * - the digits re-render exactly on each wall-clock second.
 * The board around it only needs a slow refresh for colours / ordering.
 */
export function LiveSlaClock({
  deadlineMs,
  leftLabel,
  overdueLabel,
  className,
}: {
  /** Absolute time (epoch ms) the SLA runs out. */
  deadlineMs: number
  leftLabel: string
  overdueLabel: string
  className?: string
}) {
  const hourRef = useRef<SVGLineElement>(null)
  const minuteRef = useRef<SVGLineElement>(null)
  const secondRef = useRef<SVGLineElement>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Hands: continuous sweep, one write per frame, paused automatically in background tabs.
  useEffect(() => {
    let frame = 0
    const draw = () => {
      const ms = Math.max(0, deadlineMs - Date.now())
      const a = leadSlaClockAngles(ms)
      hourRef.current?.setAttribute('transform', `rotate(${a.hourAngle}, 20, 20)`)
      minuteRef.current?.setAttribute('transform', `rotate(${a.minuteAngle}, 20, 20)`)
      secondRef.current?.setAttribute('transform', `rotate(${a.secondAngle}, 20, 20)`)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [deadlineMs])

  // Digits: tick exactly on the second boundary so they never stutter or skip.
  useEffect(() => {
    let timer = 0
    const tick = () => {
      setNowMs(Date.now())
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    return () => window.clearTimeout(timer)
  }, [])

  const ms = deadlineMs - nowMs
  const overdue = ms < 0
  const remainingSec = Math.max(0, Math.floor(ms / 1000))
  const tone = leadSlaTone(overdue ? 0 : remainingSec)
  const start = leadSlaClockAngles(Math.max(0, ms))

  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)}>
      <div className={cn('relative size-8 shrink-0 rounded-full', tone.glow)}>
        <svg viewBox="0 0 40 40" className="size-full" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="transparent" stroke={tone.stroke} strokeWidth="2" strokeOpacity="0.5" />
          <line ref={hourRef} x1="20" y1="20" x2="20" y2="10" stroke={tone.stroke} strokeWidth="2" strokeLinecap="round"
            transform={`rotate(${start.hourAngle}, 20, 20)`} />
          <line ref={minuteRef} x1="20" y1="20" x2="20" y2="7" stroke={tone.stroke} strokeWidth="1.5" strokeLinecap="round"
            transform={`rotate(${start.minuteAngle}, 20, 20)`} />
          <line ref={secondRef} x1="20" y1="20" x2="20" y2="5" stroke={tone.stroke} strokeWidth="1" strokeLinecap="round"
            transform={`rotate(${start.secondAngle}, 20, 20)`} />
          <circle cx="20" cy="20" r="2" fill={tone.stroke} />
        </svg>
      </div>
      <div className="whitespace-nowrap">
        <p className={cn('text-ds-caption font-semibold tabular-nums leading-tight', tone.text)}>
          {overdue ? formatCountdown(ms) : formatLeadSlaTime(remainingSec)}
        </p>
        <p className="text-ds-micro leading-tight text-muted-foreground">{overdue ? overdueLabel : leftLabel}</p>
      </div>
    </div>
  )
}
