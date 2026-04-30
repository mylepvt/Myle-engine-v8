import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { apiUrl } from '@/lib/api'

type PremiereState = 'upcoming' | 'waiting' | 'live' | 'ended'

type PremiereData = {
  state: PremiereState
  video_url: string | null
  waiting_starts_at: string
  live_starts_at: string
  live_ends_at: string
  premiere_link: string
}

async function fetchPremiereState(): Promise<PremiereData> {
  const res = await fetch(apiUrl('/api/v1/other/premiere'))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<PremiereData>
}

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = new Date(targetIso).getTime() - nowMs
  if (diff <= 0) return '00:00'
  const totalSeconds = Math.floor(diff / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatTimeIST(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

function formatDateIST(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return ''
  }
}

function startAmbient(ctx: AudioContext): () => void {
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, ctx.currentTime)
  master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 5)
  master.connect(ctx.destination)

  // A major chord drone: A2, E3, A3, C#4, E4
  const freqs = [110, 165, 220, 277.18, 329.63]
  const oscs = freqs.map((freq, i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq + (Math.random() - 0.5) * 0.4
    g.gain.value = i === 0 ? 0.35 : 0.22
    osc.connect(g)
    g.connect(master)
    osc.start()
    // Slow vibrato LFO per oscillator
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.18 + i * 0.04
    lfoGain.gain.value = freq * 0.003
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfo.start()
    return { osc, lfo }
  })

  return () => {
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5)
    setTimeout(() => {
      oscs.forEach(({ osc, lfo }) => {
        try { osc.stop() } catch { /* ignore */ }
        try { lfo.stop() } catch { /* ignore */ }
      })
      try { ctx.close() } catch { /* ignore */ }
    }, 3000)
  }
}

export function LivePremierePage() {
  const { data, isError } = useQuery({
    queryKey: ['premiere', 'state'],
    queryFn: fetchPremiereState,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [muted, setMuted] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const stopAmbientRef = useRef<(() => void) | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoplayedRef = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  // Auto-play video when state transitions to live
  useEffect(() => {
    if (data?.state === 'live' && videoRef.current && !autoplayedRef.current) {
      autoplayedRef.current = true
      void videoRef.current.play().catch(() => { /* browser policy */ })
    }
    if (data?.state !== 'live') {
      autoplayedRef.current = false
    }
  }, [data?.state])

  // Ambient music: start when waiting, stop otherwise
  useEffect(() => {
    if (data?.state === 'waiting' && soundEnabled && !muted) {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        stopAmbientRef.current = startAmbient(ctx)
      }
    } else {
      if (stopAmbientRef.current) {
        stopAmbientRef.current()
        stopAmbientRef.current = null
        audioCtxRef.current = null
      }
    }
  }, [data?.state, soundEnabled, muted])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAmbientRef.current?.()
    }
  }, [])

  function handleEnableSound() {
    setSoundEnabled(true)
    setMuted(false)
  }

  function toggleMute() {
    setMuted((prev) => !prev)
  }

  const state = data?.state ?? 'upcoming'
  const streamSrc = apiUrl('/api/v1/other/premiere/stream')

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
      {state === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.07),transparent_55%)]" />
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_32px_120px_-72px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f5f8ff]">Daily Session</h1>
            </div>
            <div className="flex items-center gap-3">
              {state === 'live' && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_14px_rgba(220,38,38,0.55)]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-400" />
                  </span>
                  Live
                </span>
              )}
              {state === 'waiting' && (
                <button
                  type="button"
                  onClick={soundEnabled ? toggleMute : handleEnableSound}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-[#c9d9ff] transition hover:bg-white/[0.1]"
                >
                  {!soundEnabled ? '🔇 Enable sound' : muted ? '🔇 Unmute' : '🔊 Mute'}
                </button>
              )}
              {data && (
                <p className="rounded-full border border-[#3f537d] bg-[#0b1120] px-4 py-2 text-[11px] font-semibold text-[#c9d9ff]">
                  {formatDateIST(data.live_starts_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
          {isError && (
            <div className="rounded-[2rem] border border-[#5b2327] bg-[#100708] px-6 py-8 text-center" role="alert">
              <p className="text-base font-semibold text-[#ffb8bd]">Could not load session info.</p>
              <p className="mt-2 text-sm text-[#d6c3c7]">Please refresh the page.</p>
            </div>
          )}

          {/* UPCOMING */}
          {state === 'upcoming' && data && (
            <section className="w-full max-w-2xl rounded-[2.25rem] border border-white/10 bg-white/[0.04] px-8 py-12 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-[#9db0d6]">Today's session</p>
              <p className="mt-4 text-[clamp(2.5rem,6vw,4rem)] font-bold tabular-nums tracking-tight text-[#f7f9ff]">
                {formatTimeIST(data.live_starts_at)}
              </p>
              <p className="mt-2 text-base text-[#7a94c4]">
                Waiting room opens at {formatTimeIST(data.waiting_starts_at)}
              </p>
              <p className="mt-6 text-sm text-[#aab8d3]">
                Session ends at {formatTimeIST(data.live_ends_at)} · Come back a few minutes early.
              </p>
            </section>
          )}

          {/* WAITING ROOM */}
          {state === 'waiting' && data && (
            <section className="w-full max-w-2xl rounded-[2.25rem] border border-indigo-500/20 bg-[linear-gradient(160deg,rgba(99,102,241,0.08),rgba(255,255,255,0.03))] px-8 py-12 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-[#a5b4fc]">Starting in</p>
              <p className="mt-4 text-[clamp(3.5rem,10vw,6rem)] font-bold tabular-nums tracking-tight text-[#f7f9ff]">
                {formatCountdown(data.live_starts_at, nowMs)}
              </p>
              <p className="mt-3 text-base text-[#818cf8]">Session starts at {formatTimeIST(data.live_starts_at)}</p>

              {!soundEnabled && (
                <button
                  type="button"
                  onClick={handleEnableSound}
                  className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-500/15 px-5 py-2.5 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
                >
                  🎵 Enable waiting room music
                </button>
              )}
              {soundEnabled && !muted && (
                <p className="mt-8 flex items-center justify-center gap-2 text-sm text-[#818cf8]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-indigo-400" />
                  </span>
                  Playing ambient music
                </p>
              )}
            </section>
          )}

          {/* LIVE */}
          {state === 'live' && data && (
            <section className="w-full overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)] backdrop-blur-2xl">
              <div className="bg-[#070d1d] p-3 sm:p-4">
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="aspect-video w-full rounded-[1.4rem] bg-black object-contain"
                    src={streamSrc}
                    playsInline
                    controls
                    controlsList="nodownload noplaybackrate"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-[1.4rem] bg-gradient-to-t from-[#030806] to-transparent" />
                </div>

                <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.045] px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-semibold text-white">Live now</p>
                    <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-red-400" />
                      </span>
                      Live
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ENDED */}
          {state === 'ended' && (
            <section className="w-full max-w-2xl rounded-[2.25rem] border border-white/8 bg-white/[0.03] px-8 py-12 text-center backdrop-blur-2xl">
              <p className="text-2xl font-semibold text-[#f7f9ff]">Today's session has ended</p>
              <p className="mt-3 text-base text-[#7a94c4]">
                Contact your team member for further details.
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
