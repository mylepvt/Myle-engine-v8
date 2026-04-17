import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'

const BOOT_SEEN_KEY = 'myle_boot_seen'

// ── Web Audio Engine ──────────────────────────────────────────────────────────
// All sounds generated via Web Audio API — no audio files required.

function createTerminalAudio() {
  let ctx: AudioContext | null = null

  function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext()
    // Resume if suspended (browsers auto-suspend until user interaction)
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  /** Soft key-click per typed character */
  function playTick() {
    try {
      const c = getCtx()
      const now = c.currentTime
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain)
      gain.connect(c.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(880 + Math.random() * 280, now)
      gain.gain.setValueAtTime(0.028, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018)
      osc.start(now)
      osc.stop(now + 0.018)
    } catch {
      /* audio blocked / not available */
    }
  }

  /** Short noise burst for warnings / alert lines */
  function playGlitch() {
    try {
      const c = getCtx()
      const now = c.currentTime
      const dur = 0.09
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1)
      const src = c.createBufferSource()
      src.buffer = buf
      const filter = c.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(1400, now)
      filter.frequency.exponentialRampToValueAtTime(380, now + dur)
      filter.Q.value = 0.6
      const gain = c.createGain()
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      src.connect(filter)
      filter.connect(gain)
      gain.connect(c.destination)
      src.start(now)
      src.stop(now + dur)
    } catch {
      /* audio blocked */
    }
  }

  /** Rising chord sequence on "SYSTEM UNLOCKED" */
  function playGranted() {
    try {
      const c = getCtx()
      const now = c.currentTime
      const notes = [330, 415, 523, 659, 880]
      notes.forEach((freq, i) => {
        const osc = c.createOscillator()
        const gain = c.createGain()
        osc.connect(gain)
        gain.connect(c.destination)
        osc.type = 'sine'
        const t = now + i * 0.07
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.07, t + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
        osc.start(t)
        osc.stop(t + 0.25)
      })
    } catch {
      /* audio blocked */
    }
  }

  function destroy() {
    try { ctx?.close() } catch { /* ignore */ }
    ctx = null
  }

  return { playTick, playGlitch, playGranted, destroy }
}
// ─────────────────────────────────────────────────────────────────────────────

type LineColor = 'green' | 'amber' | 'cyan' | 'red' | 'dim' | 'white'

interface LineItem {
  id: number
  text: string
  color: LineColor
  complete: boolean
}

interface TerminalStats {
  activeLeads: number
  followUps: number
  winRatePct: number | null
}

const COLOR_CLASS: Record<LineColor, string> = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  cyan: 'text-cyan-400',
  red: 'text-red-400',
  dim: 'text-zinc-500',
  white: 'text-zinc-200',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'SYSTEM ADMIN',
  leader: 'TEAM LEADER',
  team: 'TEAM MEMBER',
}

export interface TerminalBootOverlayProps {
  userName: string
  userRole: string
  userFboId: string
  onFinish: () => void
}

export function TerminalBootOverlay({
  userName,
  userRole,
  userFboId,
  onFinish,
}: TerminalBootOverlayProps) {
  const [lines, setLines] = useState<LineItem[]>([])
  const [exiting, setExiting] = useState(false)
  const lineIdRef = useRef(0)
  const statsRef = useRef<TerminalStats | null>(null)
  const statsReadyRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<ReturnType<typeof createTerminalAudio> | null>(null)

  // Init + cleanup audio
  useEffect(() => {
    audioRef.current = createTerminalAudio()
    return () => {
      audioRef.current?.destroy()
      audioRef.current = null
    }
  }, [])

  // Skip mode: fast animation on repeat logins
  const isSkip = (() => {
    try {
      return localStorage.getItem(BOOT_SEEN_KEY) === '1'
    } catch {
      return false
    }
  })()

  const charSpeed = isSkip ? 3 : 16   // ms per character
  const lineGap = isSkip ? 12 : 70    // ms pause between lines
  const stageGap = isSkip ? 25 : 180  // ms pause between stages
  const endPause = isSkip ? 250 : 700 // ms hold on final screen

  // Fetch workboard + follow-ups stats in background immediately
  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const wbRes = await apiFetch('/api/v1/workboard', { signal: ctrl.signal })
        if (!wbRes.ok) return
        const wb: { columns?: { status: string; total: number }[] } = await wbRes.json()

        let activeLeads = 0
        let followUpLeads = 0
        let won = 0
        let lost = 0

        if (wb?.columns) {
          for (const col of wb.columns) {
            const t = typeof col.total === 'number' ? col.total : 0
            activeLeads += t
            if (col.status === 'follow_up') followUpLeads = t
            if (col.status === 'converted' || col.status === 'won') won = t
            if (col.status === 'lost') lost = t
          }
        }

        const closed = won + lost
        const winRatePct = closed > 0 ? Math.round((won / closed) * 100) : null

        statsRef.current = { activeLeads, followUps: followUpLeads, winRatePct }
        statsReadyRef.current = true
      } catch {
        // ignore — stats are optional
      }
    })()
    return () => ctrl.abort()
  }, [])

  // Auto-scroll terminal to bottom as lines are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  // Main animation sequence
  useEffect(() => {
    // Skip animation entirely in automated test environments (Playwright, Selenium, etc.)
    if (navigator.webdriver) {
      onFinish()
      return
    }

    const nextId = () => ++lineIdRef.current

    // Type a line character by character, returns promise that resolves when done
    const typeLine = (text: string, color: LineColor): Promise<void> =>
      new Promise<void>((resolve) => {
        const id = nextId()
        setLines((prev) => [...prev, { id, text: '', color, complete: false }])
        let i = 0
        const tick = () => {
          i++
          audioRef.current?.playTick()
          setLines((prev) =>
            prev.map((l) => (l.id === id ? { ...l, text: text.slice(0, i) } : l)),
          )
          if (i >= text.length) {
            setLines((prev) =>
              prev.map((l) => (l.id === id ? { ...l, complete: true } : l)),
            )
            resolve()
          } else {
            setTimeout(tick, charSpeed)
          }
        }
        setTimeout(tick, charSpeed)
      })

    const blankLine = (): Promise<void> => {
      const id = nextId()
      setLines((prev) => [...prev, { id, text: '', color: 'dim', complete: true }])
      return Promise.resolve()
    }

    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    async function run() {
      // ── BOOT ──
      await typeLine('> INITIALIZING MYLE COMMAND SYSTEM...', 'dim')
      await wait(lineGap)
      await typeLine('> BOOT SEQUENCE INITIATED', 'green')
      await wait(lineGap)
      await typeLine('> SECURE CHANNEL ESTABLISHED  ✔', 'green')
      await wait(stageGap)

      // ── AUTH ──
      await typeLine('> VERIFYING CREDENTIALS...', 'dim')
      await wait(lineGap)
      await typeLine('> ENCRYPTION KEY MATCH  ✔', 'cyan')
      await wait(lineGap)
      await typeLine('> AUTHENTICATION SUCCESS  ✔', 'cyan')
      await wait(stageGap)

      // ── USER IDENTITY ──
      await blankLine()
      await typeLine('> IDENTIFYING USER...', 'dim')
      await wait(lineGap)
      await typeLine(`> NAME  : ${userName.toUpperCase()}`, 'white')
      await wait(lineGap)
      await typeLine(`> ROLE  : ${ROLE_LABEL[userRole] ?? userRole.toUpperCase()}`, 'amber')
      await wait(lineGap)
      await typeLine(`> ID    : ${userFboId.toUpperCase()}`, 'amber')
      await wait(stageGap)

      // ── PERFORMANCE DATA ──
      await blankLine()
      await typeLine('> FETCHING PERFORMANCE DATA...', 'dim')

      // Wait for stats, max ~2.5 s
      const deadline = Date.now() + 2500
      while (!statsReadyRef.current && Date.now() < deadline) {
        await wait(80)
      }

      if (statsReadyRef.current && statsRef.current) {
        const s = statsRef.current
        await typeLine(`> ACTIVE LEADS      : ${s.activeLeads}`, 'amber')
        await wait(lineGap)
        await typeLine(
          `> FOLLOW-UPS PENDING: ${s.followUps}`,
          s.followUps > 0 ? 'amber' : 'dim',
        )
        await wait(lineGap)
        if (s.winRatePct !== null) {
          await typeLine(
            `> CLOSING RATE      : ${s.winRatePct}%`,
            s.winRatePct >= 30 ? 'green' : 'amber',
          )
          await wait(lineGap)
        }
        await wait(stageGap)

        // ── BEHAVIORAL ALERT ──
        if (s.followUps > 0) {
          await blankLine()
          audioRef.current?.playGlitch()
          await typeLine(
            `> ⚠  ALERT: ${s.followUps} LEAD${s.followUps !== 1 ? 'S' : ''} COOLING DOWN`,
            'red',
          )
          await wait(lineGap)
          await typeLine('> ACTION REQUIRED: OPEN FOLLOW-UPS NOW', 'amber')
          await wait(stageGap)
        }
      } else {
        await typeLine('> PERFORMANCE DATA UNAVAILABLE', 'dim')
        await wait(stageGap)
      }

      // ── ACCESS GRANTED ──
      await blankLine()
      await typeLine('> ACCESS LEVEL  : ELITE', 'cyan')
      await wait(lineGap)
      audioRef.current?.playGranted()
      await typeLine('> SYSTEM UNLOCKED  ✔', 'green')
      await wait(endPause)

      // Mark seen for skip mode on next login
      try {
        localStorage.setItem(BOOT_SEEN_KEY, '1')
      } catch {
        /* private mode */
      }

      // Exit
      setExiting(true)
      await wait(500)
      onFinish()
    }

    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="terminal-boot-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.45s ease-out',
      }}
      role="status"
      aria-label="System boot sequence"
      aria-live="polite"
    >
      {/* Grid pattern background */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(84,101,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(84,101,255,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Scanline overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Terminal text area */}
      <div
        ref={scrollRef}
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          overflowY: 'auto',
          padding: '2rem 1.5rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <div>
          {lines.map((line) => (
            <div
              key={line.id}
              className={COLOR_CLASS[line.color]}
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
                fontSize: 'clamp(0.72rem, 2vw, 0.9rem)',
                lineHeight: '1.7',
                marginBottom: '1px',
                letterSpacing: '0.03em',
              }}
            >
              {line.text || '\u00A0'}
              {!line.complete && (
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: '0.5em',
                    height: '1em',
                    background: '#34d399',
                    marginLeft: '2px',
                    verticalAlign: 'middle',
                    animation: 'myle-cursor-blink 0.8s step-end infinite',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          borderTop: '1px solid #1c1c1c',
          padding: '0.5rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6rem',
          color: '#3f3f46',
          letterSpacing: '0.08em',
        }}
      >
        <span>MYLE COMMAND SYSTEM v3</span>
        <span>SECURE BOOT · AES-256</span>
      </div>

      {/* Cursor blink keyframe — injected inline so no CSS file edit needed */}
      <style>{`
        @keyframes myle-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
