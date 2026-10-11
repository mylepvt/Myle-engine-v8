import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw, Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { useJackpotWheelQuery } from '@/hooks/use-rewards-query'
import { audioReady, haptic, playAppSound, startWheelWhoosh, type WheelWhoosh } from '@/lib/app-sounds'
import { chanceLabel, rupees, spinRotation, wheelSlices, type WheelSlice } from '@/lib/rewards'
import { cn } from '@/lib/utils'

const VIEW = 320
const C = VIEW / 2
const R = 132 // slice radius
export const SPIN_MS = 30_000 // the draw spins for 30 s
const TURNS = 18 // full turns before it settles on the winner
const PEG_DEG = 15 // a "tick" every 15° (24 pegs round the wheel)
const BULBS = 24
const easeOut = (x: number) => 1 - (1 - x) ** 3 // fast start, long suspenseful crawl
const SEEN_KEY = 'myle.rewards.wheelSeen'

/** Casino palette — the wheel sits on its own dark stage, so these are decoration, not theme. */
const PALETTE: [string, string][] = [
  ['#FDE68A', '#D97706'],
  ['#C4B5FD', '#6D28D9'],
  ['#5EEAD4', '#0F766E'],
  ['#FDA4AF', '#BE123C'],
  ['#7DD3FC', '#0369A1'],
  ['#6EE7B7', '#047857'],
  ['#FDBA74', '#C2410C'],
  ['#A5B4FC', '#4338CA'],
]

function point(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

function slicePath(s: WheelSlice) {
  if (s.end - s.start >= 359.99) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`
  const [x1, y1] = point(s.start, R)
  const [x2, y2] = point(s.end, R)
  const large = s.end - s.start > 180 ? 1 : 0
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`
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

const CONFETTI = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.2
  const dist = 90 + ((i * 37) % 70)
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist + 60,
    rot: (i * 97) % 720,
    color: PALETTE[i % PALETTE.length][i % 2],
    delay: (i % 6) * 40,
    round: i % 4 === 0,
  }
})

/** Tonight's jackpot wheel: before 9 PM it shows who is in (slice = tickets); once the
 * server has drawn, it spins and lands on the winner the server picked. */
export function JackpotWheel({ myTickets, bare = false }: { myTickets: number; bare?: boolean }) {
  const { data } = useJackpotWheelQuery()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const [bulbPhase, setBulbPhase] = useState(0)
  const frame = useRef<number | null>(null)
  const finish = useRef<(() => void) | null>(null)
  const whoosh = useRef<WheelWhoosh | null>(null)
  const pointer = useRef<SVGGElement | null>(null)

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
      whoosh.current?.stop()
    },
    [],
  )

  // Marquee lights: chase fast while spinning, breathe slowly at rest.
  useEffect(() => {
    const id = window.setInterval(() => setBulbPhase((p) => p + 1), spinning ? 110 : 650)
    return () => window.clearInterval(id)
  }, [spinning])

  useEffect(() => {
    if (!celebrate) return
    const id = window.setTimeout(() => setCelebrate(false), 2600)
    return () => window.clearTimeout(id)
  }, [celebrate])

  const flickPointer = () => {
    const el = pointer.current
    if (!el) return
    el.style.transform = 'rotate(-16deg)'
    window.setTimeout(() => {
      if (pointer.current) pointer.current.style.transform = 'rotate(0deg)'
    }, 55)
  }

  const spin = () => {
    if (!data || data.winner_user_id == null) return
    if (frame.current != null) window.cancelAnimationFrame(frame.current)
    whoosh.current?.stop()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = rotation
    const target = from - (from % 360) + spinRotation(slices, data.winner_user_id as number, TURNS) + 360
    const startedAt = Date.now()
    let lastPeg = Math.floor(from / PEG_DEG)

    const done = () => {
      frame.current = null
      finish.current = null
      whoosh.current?.stop()
      whoosh.current = null
      setRotation(target)
      setSpinning(false)
      setRevealed(true)
      setNeedsTap(false)
      setCelebrate(true)
      markSeen(data.draw_date)
      haptic([40, 30, 90, 30, 160])
      playAppSound('jackpot')
      if (winner) toast.success(`${winner.name} won ${rupees(data.pot_rupees)}!`)
    }
    finish.current = done
    setRevealed(false)
    setNeedsTap(false)
    setCelebrate(false)
    if (reduce) return done()

    setSpinning(true)
    whoosh.current = startWheelWhoosh()
    const step = () => {
      const x = Math.min(1, (Date.now() - startedAt) / SPIN_MS)
      const angle = from + (target - from) * easeOut(x)
      const speed = (1 - x) ** 2 // derivative of the ease, 1 → 0
      whoosh.current?.update(speed)
      const peg = Math.floor(angle / PEG_DEG)
      if (peg !== lastPeg) {
        lastPeg = peg
        playAppSound('wheel_tick', { speed: 1 - x })
        flickPointer()
        if (x > 0.8) haptic(6) // the last slow clicks you can feel
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
    <div
      className={cn('relative overflow-hidden text-white', bare ? 'rounded-xl' : 'rounded-2xl px-3 py-4')}
      style={{
        background:
          'radial-gradient(120% 90% at 50% 0%, #3b2a6b 0%, #1a1433 45%, #0b0915 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 50px -30px rgba(109,40,217,0.6)',
      }}
    >
      <style>{`
        @keyframes myle-confetti { 0% { transform: translate(0,0) rotate(0deg); opacity: 1 }
          100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0 } }
        @keyframes myle-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .myle-confetti { display: none } }
      `}</style>
      {bare ? null : (
        <p className="text-center text-ds-caption font-semibold tracking-wide text-white/90">
          {drawn ? "Tonight's draw" : "Tonight's wheel"} · {data.entries.length} in ·{' '}
          {rupees(data.pot_rupees)}
        </p>
      )}

      <div className="relative mx-auto mt-2 w-full max-w-[300px]">
        {/* soft halo behind the wheel */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-6 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(253,230,138,0.35) 0%, rgba(253,230,138,0) 70%)',
            animation: spinning ? 'myle-glow 0.6s ease-in-out infinite' : undefined,
          }}
        />
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="relative block h-auto w-full"
          role="img"
          aria-label={`Jackpot wheel with ${data.entries.length} members`}
        >
          <defs>
            {PALETTE.map(([light, dark], i) => (
              <radialGradient key={i} id={`myle-slice-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="15%" stopColor={light} />
                <stop offset="100%" stopColor={dark} />
              </radialGradient>
            ))}
            <linearGradient id="myle-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="35%" stopColor="#F59E0B" />
              <stop offset="65%" stopColor="#B45309" />
              <stop offset="100%" stopColor="#FDE68A" />
            </linearGradient>
            <radialGradient id="myle-gloss" cx="35%" cy="25%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="myle-hub" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#2a1f4d" />
              <stop offset="100%" stopColor="#0b0915" />
            </radialGradient>
          </defs>

          {/* Gold rim with marquee bulbs */}
          <circle cx={C} cy={C} r={156} fill="url(#myle-gold)" />
          <circle cx={C} cy={C} r={146} fill="#120d24" />
          {Array.from({ length: BULBS }, (_, i) => {
            const [bx, by] = point((i * 360) / BULBS, 151)
            const lit = showResult ? bulbPhase % 2 === 0 : (i + bulbPhase) % 2 === 0
            return (
              <circle
                key={i}
                cx={bx}
                cy={by}
                r={3.6}
                fill={lit ? '#FFFBEB' : '#92400E'}
                style={lit ? { filter: 'drop-shadow(0 0 4px rgba(254,243,199,0.95))' } : undefined}
              />
            )
          })}

          {/* The wheel itself */}
          <g transform={`rotate(${rest} ${C} ${C})`}>
            {slices.map((s, i) => {
              const mid = (s.start + s.end) / 2
              const [tx, ty] = point(mid, R * 0.64)
              const isWinner = showResult && s.userId === data.winner_user_id
              return (
                <g key={s.key} opacity={showResult && !isWinner ? 0.35 : 1}>
                  <path
                    d={slicePath(s)}
                    fill={`url(#myle-slice-${i % PALETTE.length})`}
                    stroke={isWinner ? '#FEF3C7' : 'rgba(255,255,255,0.55)'}
                    strokeWidth={isWinner ? 3 : 1.2}
                  />
                  {s.end - s.start >= 14 ? (
                    <text
                      x={tx}
                      y={ty}
                      transform={`rotate(${mid > 180 ? mid + 90 : mid - 90} ${tx} ${ty})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-xs font-bold"
                      fill="#ffffff"
                      stroke="rgba(0,0,0,0.35)"
                      strokeWidth={2.5}
                      paintOrder="stroke"
                    >
                      {s.label.slice(0, 10)}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {/* pegs — one per tick */}
            {Array.from({ length: 360 / PEG_DEG }, (_, i) => {
              const [px, py] = point(i * PEG_DEG, R - 5)
              return <circle key={i} cx={px} cy={py} r={2.6} fill="url(#myle-gold)" stroke="#78350F" strokeWidth={0.6} />
            })}
          </g>

          {/* gloss + hub stay still */}
          <circle cx={C} cy={C} r={R} fill="url(#myle-gloss)" pointerEvents="none" />
          <circle cx={C} cy={C} r={34} fill="url(#myle-gold)" />
          <circle cx={C} cy={C} r={28} fill="url(#myle-hub)" />
          <text
            x={C}
            y={C + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs font-extrabold"
            fill="#FDE68A"
          >
            {rupees(data.pot_rupees)}
          </text>

          {/* pointer: flicks on every peg */}
          <g
            ref={pointer}
            style={{ transformOrigin: `${C}px 18px`, transition: 'transform 55ms ease-out' }}
          >
            <path
              d={`M ${C - 13} 6 Q ${C} -2 ${C + 13} 6 L ${C} 40 Z`}
              fill="url(#myle-gold)"
              stroke="#78350F"
              strokeWidth={1}
              style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.5))' }}
            />
            <circle cx={C} cy={14} r={4.5} fill="#E11D48" stroke="#FEF3C7" strokeWidth={1.2} />
          </g>
        </svg>

        {celebrate ? (
          <div aria-hidden className="myle-confetti pointer-events-none absolute left-1/2 top-1/2">
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                className={cn('absolute block h-2.5 w-1.5', c.round && 'h-2 w-2 rounded-full')}
                style={
                  {
                    background: c.color,
                    animation: `myle-confetti 1.8s cubic-bezier(.2,.7,.3,1) ${c.delay}ms forwards`,
                    '--dx': `${c.dx}px`,
                    '--dy': `${c.dy}px`,
                    '--rot': `${c.rot}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {drawn ? (
        showResult && winner ? (
          <div className="mt-2 text-center">
            <Trophy className="mx-auto size-5 text-warning" aria-hidden />
            <p
              className="mt-1 bg-clip-text text-ds-h3 font-extrabold text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #FEF3C7, #F59E0B, #FEF3C7)' }}
            >
              {winner.name} won {rupees(data.pot_rupees)}
            </p>
            <button
              type="button"
              onClick={spin}
              className="mt-1.5 inline-flex items-center gap-1 text-ds-caption font-semibold text-white/80 hover:text-white"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Watch again
            </button>
          </div>
        ) : spinning ? (
          <p className="mt-2 text-center text-ds-caption font-semibold text-white" aria-live="polite">
            Spinning… {secondsLeft}s{' '}
            <button type="button" onClick={skip} className="ml-1 font-normal text-white/60 underline">
              Skip
            </button>
          </p>
        ) : needsTap ? (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={spin}
              className="inline-flex animate-pulse items-center gap-1.5 rounded-full px-5 py-2 text-ds-body font-bold text-warning-foreground shadow-lg"
              style={{ backgroundImage: 'linear-gradient(90deg, #FDE68A, #F59E0B)' }}
            >
              <Play className="size-4" aria-hidden /> Watch tonight&apos;s draw
            </button>
          </div>
        ) : null
      ) : (
        <p className="mt-2 text-center text-ds-caption text-white/75">
          {bare ? `${data.entries.length} in tonight's draw · ` : ''}Spins at 9 PM · bigger slice = more tickets
          {chance ? (
            <>
              {' '}
              · <span className="font-semibold text-warning">your chance {chance}</span>
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}
