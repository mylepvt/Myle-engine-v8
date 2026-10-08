import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { useJackpotWheelQuery } from '@/hooks/use-rewards-query'
import { chanceLabel, rupees, spinRotation, wheelSlices, type WheelSlice } from '@/lib/rewards'
import { cn } from '@/lib/utils'

const SIZE = 220
const R = SIZE / 2
const SPIN_MS = 5500
const TONES = ['fill-primary', 'fill-warning', 'fill-success', 'fill-destructive']
const SEEN_KEY = 'myle.rewards.wheelSeen'

function point(deg: number, r = R) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [R + r * Math.cos(rad), R + r * Math.sin(rad)]
}

function slicePath(s: WheelSlice) {
  if (s.end - s.start >= 359.99) return `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z`
  const [x1, y1] = point(s.start)
  const [x2, y2] = point(s.end)
  const large = s.end - s.start > 180 ? 1 : 0
  return `M ${R} ${R} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`
}

function seenDraw(date: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === date
  } catch {
    return true // no storage → don't auto-play every refresh
  }
}

function markSeen(date: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, date)
  } catch {
    /* private mode — ignore */
  }
}

/** Tonight's jackpot wheel: before 9 PM it shows who is in (slice = tickets); once the
 * server has drawn, it spins and lands on the winner the server picked. */
export function JackpotWheel({ myTickets }: { myTickets: number }) {
  const { data } = useJackpotWheelQuery()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const slices = useMemo(
    () => (data ? wheelSlices(data.entries, data.winner_user_id) : []),
    [data],
  )
  const total = slices.reduce((s, x) => s + x.tickets, 0)
  const winner = data?.entries.find((e) => e.user_id === data.winner_user_id) ?? null
  const drawn = data?.status === 'drawn'

  const spin = () => {
    if (!data || data.winner_user_id == null) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setRevealed(false)
    setSpinning(true)
    setRotation((r) => r - (r % 360) + spinRotation(slices, data.winner_user_id as number) + 360)
    window.setTimeout(
      () => {
        setSpinning(false)
        setRevealed(true)
        markSeen(data.draw_date)
        if (winner) toast.success(`${winner.name} won ${rupees(data.pot_rupees)}!`)
      },
      reduce ? 0 : SPIN_MS,
    )
  }

  // Auto-play the draw once per day, the first time the member sees the result.
  const autoPlay = drawn && data?.winner_user_id != null && !seenDraw(data.draw_date)
  useEffect(() => {
    if (!autoPlay) return
    const id = window.setTimeout(spin, 400)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the result arrives
  }, [autoPlay])

  // Already watched today → rest the wheel on the winner (no animation).
  const restOnWinner = drawn && data?.winner_user_id != null && !autoPlay && !spinning && rotation === 0
  const rest = restOnWinner ? spinRotation(slices, data.winner_user_id as number, 0) : rotation

  if (!data || !slices.length) return null
  const chance = drawn ? null : chanceLabel(myTickets, total)
  const showResult = drawn && (revealed || (!spinning && seenDraw(data.draw_date)))

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-3">
      <p className="text-center text-ds-caption font-semibold text-foreground">
        {drawn ? "Tonight's draw" : "Tonight's wheel"} · {data.entries.length} in ·{' '}
        {rupees(data.pot_rupees)}
      </p>
      <div className="relative mx-auto mt-2" style={{ width: SIZE, height: SIZE + 10 }}>
        {/* Pointer */}
        <div
          aria-hidden
          className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[14px] border-x-transparent border-t-foreground"
        />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="mt-2.5 drop-shadow-sm"
          style={{
            transform: `rotate(${rest}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)` : 'none',
          }}
          role="img"
          aria-label={`Jackpot wheel with ${data.entries.length} members`}
        >
          {slices.map((s, i) => {
            const mid = (s.start + s.end) / 2
            const [tx, ty] = point(mid, R * 0.62)
            const isWinner = showResult && s.userId === data.winner_user_id
            return (
              <g key={s.key}>
                <path
                  d={slicePath(s)}
                  className={cn(TONES[i % TONES.length], isWinner ? 'opacity-100' : showResult ? 'opacity-40' : 'opacity-80')}
                  stroke="var(--color-background, #fff)"
                  strokeWidth={1.5}
                />
                {s.end - s.start >= 16 ? (
                  <text
                    x={tx}
                    y={ty}
                    transform={`rotate(${mid > 180 ? mid + 90 : mid - 90} ${tx} ${ty})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-white text-ds-micro font-semibold"
                  >
                    {s.label.slice(0, 10)}
                  </text>
                ) : null}
              </g>
            )
          })}
          <circle cx={R} cy={R} r={14} className="fill-background" />
        </svg>
      </div>

      {drawn ? (
        showResult && winner ? (
          <div className="mt-1 text-center">
            <p className="text-sm font-bold text-foreground">
              {winner.name} won {rupees(data.pot_rupees)}
            </p>
            <button
              type="button"
              onClick={spin}
              className="mt-1 inline-flex items-center gap-1 text-ds-caption font-semibold text-primary"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Watch again
            </button>
          </div>
        ) : (
          <p className="mt-1 text-center text-ds-caption font-semibold text-warning-ink" aria-live="polite">
            {spinning ? 'Spinning…' : ''}
          </p>
        )
      ) : (
        <p className="mt-1 text-center text-ds-caption text-muted-foreground">
          Spins at 9 PM · bigger slice = more tickets
          {chance ? (
            <>
              {' '}
              · <span className="font-semibold text-foreground">your chance {chance}</span>
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}
