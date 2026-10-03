import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Flame, Zap } from 'lucide-react'

import { onXpFly } from '@/lib/xp-fly'

type Burst = {
  id: number
  x: number
  y: number
  amount: number
  streak?: number
  icons: { dx: number; rise: number; delay: number; size: number }[]
}

const BURST_MS = 1500
// A tap older than this is not "the action that earned it" — use the default spot.
const TAP_FRESH_MS = 8000

function defaultOrigin() {
  // Bottom-centre, just above the mobile tab bar.
  return { x: window.innerWidth / 2, y: window.innerHeight - 120 }
}

/**
 * App-wide overlay for the XP reward burst: lightning icons and a "+8 XP"
 * badge float up from where the user last tapped (like Instagram's heart).
 */
export function XpFlyLayer() {
  const [bursts, setBursts] = useState<Burst[]>([])
  const lastTap = useRef<{ x: number; y: number; at: number } | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      lastTap.current = { x: e.clientX, y: e.clientY, at: Date.now() }
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })

    const off = onXpFly(({ amount, streak }) => {
      const tap = lastTap.current
      const origin = tap && Date.now() - tap.at < TAP_FRESH_MS ? tap : defaultOrigin()
      const id = nextId.current++
      const big = Boolean(streak)
      const icons = Array.from({ length: big ? 10 : 6 }, (_, i) => ({
        dx: Math.round((Math.random() - 0.5) * (big ? 180 : 120)),
        rise: (big ? 180 : 140) + Math.round(Math.random() * 90),
        delay: i * (big ? 55 : 70),
        size: (big ? 20 : 16) + Math.round(Math.random() * 10),
      }))
      setBursts((all) => [...all, { id, x: origin.x, y: origin.y, amount, streak, icons }])
      window.setTimeout(() => setBursts((all) => all.filter((b) => b.id !== id)), BURST_MS)
    })

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      off()
    }
  }, [])

  if (!bursts.length) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden" aria-hidden>
      {bursts.map((b) => (
        <div key={b.id}>
          {b.icons.map((icon, i) => {
            const Icon = b.streak ? Flame : Zap
            return (
              <Icon
                key={i}
                className="xp-fly-icon absolute fill-warning text-warning drop-shadow"
                style={
                  {
                    left: b.x,
                    top: b.y - icon.size / 2,
                    width: icon.size,
                    height: icon.size,
                    animationDelay: `${icon.delay}ms`,
                    '--xp-dx': `${icon.dx}px`,
                    '--xp-rise': `${icon.rise}px`,
                  } as CSSProperties
                }
              />
            )
          })}
          <span
            className={
              b.streak
                ? 'xp-fly-label absolute whitespace-nowrap rounded-full bg-warning px-4 py-1.5 text-base font-extrabold tabular-nums text-warning-foreground shadow-xl'
                : 'xp-fly-label absolute whitespace-nowrap rounded-full bg-warning px-3 py-1 text-sm font-bold tabular-nums text-warning-foreground shadow-lg'
            }
            style={{ left: b.x, top: b.y - 32 }}
          >
            {b.streak ? `${b.streak}-day streak!` : `+${b.amount} XP`}
          </span>
        </div>
      ))}
    </div>
  )
}
