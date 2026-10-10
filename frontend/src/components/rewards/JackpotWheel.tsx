import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { useJackpotWheelQuery } from '@/hooks/use-rewards-query'
import { audioReady, playAppSound } from '@/lib/app-sounds'
import { chanceLabel, rupees, spinRotation, wheelSlices, type WheelSlice } from '@/lib/rewards'
import { cn } from '@/lib/utils'

const SIZE = 220
const R = SIZE / 2
export const SPIN_MS = 30_000 // the draw spins for 30 s
const TURNS = 18 // full turns before it settles on the winner
const PEG_DEG = 15 // a "tick" every 15° (24 pegs round the wheel)
const easeOut = (x: number) => 1 - (1 - x) ** 3 // fast start, long suspenseful crawl
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
export function JackpotWheel({ myTickets, bare = false }: { myTickets: number; bare?: boolean }) {
  const { data } = useJackpotWheelQuery()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const frame = useRef<number | null>(null)
  const finish = useRef<(() => void) | null>(null)

  const slices = useMemo(
    () => (data ? wheelSlices(data.entries, data.winner_user_id) : []),
    [data],
  )
  const total = slices.reduce((s, x) => s + x.tickets, 0)
  const winner = data?.entries.find((e) => e.user_id === data.winner_user_id) ?? null
  const drawn = data?.status === 'drawn'

  useEffect(
    () => () => {
      if (frame.current != null) window.cancelAnimationFrame(frame.current)
    },
    [],
  )

  const spin = () => {
    if (!data || data.winner_user_id == null) return
    if (frame.current != null) window.cancelAnimationFrame(frame.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = rotation
    const target = from - (from % 360) + spinRotation(slices, data.winner_user_id as number, TURNS) + 360
    const startedAt = Date.now()
    let lastPeg = Math.floor(from / PEG_DEG)

    const done = () => {
      frame.current = null
      finish.current = null
      setRotation(target)
      setSpinning(false)
      setRevealed(true)
      setNeedsTap(false)
      markSeen(data.draw_date)
      playAppSound('jackpot')
      if (winner) toast.success(`${winner.name} won ${rupees(data.pot_rupees)}!`)
    }
    finish.current = done
    setRevealed(false)
    setNeedsTap(false)
    if (reduce) return done()

    setSpinning(true)
    const step = () => {
      const x = Math.min(1, (Date.now() - startedAt) / SPIN_MS)
      const angle = from + (target - from) * easeOut(x)
      const peg = Math.floor(angle / PEG_DEG)
      if (peg !== lastPeg) {
        lastPeg = peg
        playAppSound('wheel_tick', { speed: 1 - x })
      }
      setRotation(angle)
      setSecondsLeft(Math.ceil(((1 - x) * SPIN_MS) / 1000))
      if (x < 1) frame.current = window.requestAnimationFrame(step)
      else done()
    }
    frame.current = window.requestAnimationFrame(step)
  }

  const skip = () => {
    if (frame.current != null) window.cancelAnimationFrame(frame.current)
    finish.current?.()
  }

  // The draw plays once per day. Browsers only allow sound after a tap, so if audio is
  // not unlocked yet we show a "Watch the draw" button instead of spinning silently.
  const autoPlay = drawn && data?.winner_user_id != null && !seenDraw(data.draw_date)
  useEffect(() => {
    if (!autoPlay) return
    const id = window.setTimeout(() => (audioReady() ? spin() : setNeedsTap(true)), 400)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the result arrives
  }, [autoPlay])

  // Already watched today → rest the wheel on the winner (no animation).
  const restOnWinner =
    drawn && data?.winner_user_id != null && !autoPlay && !spinning && rotation === 0
  const rest = restOnWinner ? spinRotation(slices, data.winner_user_id as number, 0) : rotation

  if (!data || !slices.length) return null
  const chance = drawn ? null : chanceLabel(myTickets, total)
  const showResult = drawn && (revealed || (!spinning && seenDraw(data.draw_date)))

  return (
    <div className={cn(!bare && 'rounded-xl border border-warning/30 bg-warning/5 px-3 py-3')}>
      {bare ? null : (
        <p className="text-center text-ds-caption font-semibold text-foreground">
          {drawn ? "Tonight's draw" : "Tonight's wheel"} · {data.entries.length} in ·{' '}
          {rupees(data.pot_rupees)}
        </p>
      )}
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
            willChange: spinning ? 'transform' : undefined,
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
        ) : spinning ? (
          <p className="mt-1 text-center text-ds-caption font-semibold text-warning-ink" aria-live="polite">
            Spinning… {secondsLeft}s{' '}
            <button type="button" onClick={skip} className="ml-1 font-normal text-muted-foreground underline">
              Skip
            </button>
          </p>
        ) : needsTap ? (
          <div className="mt-1 text-center">
            <button
              type="button"
              onClick={spin}
              className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-warning px-4 py-1.5 text-ds-caption font-bold text-warning-foreground"
            >
              <Play className="size-3.5" aria-hidden /> Watch tonight&apos;s draw
            </button>
          </div>
        ) : null
      ) : (
        <p className="mt-1 text-center text-ds-caption text-muted-foreground">
          {bare ? `${data.entries.length} in tonight's draw · ` : ''}Spins at 9 PM · bigger slice = more tickets
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
