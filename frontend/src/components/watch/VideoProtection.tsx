import { useEffect, useState } from 'react'

/**
 * Moving name/number watermark + live clock over the video, a faint centred copy
 * for full coverage, and the black-out cover while obscured. Place inside the
 * video's `relative` wrapper.
 */
export function VideoWatermarkOverlay({ label, obscured }: { label: string; obscured: boolean }) {
  const [pos, setPos] = useState({ top: 12, left: 10 })
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString())

  useEffect(() => {
    const move = () => {
      setPos({ top: 10 + Math.random() * 75, left: 8 + Math.random() * 70 })
      setClock(new Date().toLocaleTimeString())
    }
    move()
    const id = window.setInterval(move, 2800)
    return () => window.clearInterval(id)
  }, [])

  return (
    <>
      <div
        className="pointer-events-none absolute z-20 rounded bg-black/35 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/80 backdrop-blur-[1px] transition-all duration-700"
        style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
      >
        {label} · {clock}
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <span className="rotate-[-18deg] text-2xl font-bold text-white/[0.06] sm:text-4xl">{label}</span>
      </div>
      {obscured ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-black text-sm text-white/60">
          Paused — return to this tab to continue
        </div>
      ) : null}
    </>
  )
}
