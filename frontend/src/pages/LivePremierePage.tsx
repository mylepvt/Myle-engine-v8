import Hls from 'hls.js'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { apiUrl } from '@/lib/api'

function getSlotParam(): number | null {
  const v = new URLSearchParams(window.location.search).get('slot')
  const n = v !== null ? parseInt(v, 10) : NaN
  return !isNaN(n) && n >= 0 && n <= 23 ? n : null
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PremiereState = 'upcoming' | 'waiting' | 'live' | 'ended'

type PremiereData = {
  state: PremiereState
  video_url: string | null
  waiting_starts_at: string
  live_starts_at: string
  live_ends_at: string
  session_hour: number
  server_now: string
  viewer_count: number
}

type ProspectInfo = {
  name: string
  city: string
  phone: string
  viewer_id: string
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'myle_premiere_prospect'

function loadProspect(): ProspectInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ProspectInfo
  } catch {
    return null
  }
}

function saveProspect(info: ProspectInfo) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info))
}

function genViewerId(): string {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchPremiereState(): Promise<PremiereData> {
  const slotParam = getSlotParam()
  const url = slotParam !== null
    ? apiUrl(`/api/v1/other/premiere?slot=${slotParam}`)
    : apiUrl('/api/v1/other/premiere')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<PremiereData>
}

async function postSilent(path: string, body: unknown): Promise<void> {
  try {
    await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // silent
  }
}

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = new Date(targetIso).getTime() - nowMs
  if (diff <= 0) return '00:00'
  const totalSec = Math.floor(diff / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimeIST(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    })
  } catch { return '—' }
}

function formatDateIST(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'Asia/Kolkata',
    })
  } catch { return '' }
}

function resolveWish(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

// Smooth fake viewer count: drifts ±1-3 every 8-12s
function useViewerCount(serverCount: number, active: boolean): number {
  const [count, setCount] = useState(serverCount || 267)
  const baseRef = useRef(serverCount || 267)

  useEffect(() => {
    if (!active) return
    baseRef.current = serverCount || baseRef.current
    const tick = () => {
      const delta = Math.floor(Math.random() * 5) - 2  // -2 to +2
      setCount((prev) => Math.min(300, Math.max(250, prev + delta)))
    }
    const delay = 8000 + Math.random() * 4000
    const id = window.setTimeout(tick, delay)
    return () => window.clearTimeout(id)
  }, [serverCount, active, count])

  return count
}

// ─── Registration Form ───────────────────────────────────────────────────────

function ProspectForm({ onSubmit }: { onSubmit: (info: ProspectInfo) => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim() || !phone.trim()) {
      setError('Please fill in all fields.')
      return
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a valid 10-digit WhatsApp number.')
      return
    }
    setError('')
    const info: ProspectInfo = {
      name: name.trim(),
      city: city.trim(),
      phone: phone.trim(),
      viewer_id: genViewerId(),
    }
    saveProspect(info)
    onSubmit(info)
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-7 py-9 shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#9db0d6]">Myle · Private Session</p>
        <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-[#f7f9ff]">
          Register for today's exclusive session
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8a9ec4]">
          Private, invitation-only. Enter your details to get access.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          {([
            { id: 'p-name', label: 'Full name', type: 'text', ac: 'name', val: name, set: setName, ph: 'Your full name' },
            { id: 'p-city', label: 'City', type: 'text', ac: 'address-level2', val: city, set: setCity, ph: 'Your city' },
            { id: 'p-phone', label: 'WhatsApp number', type: 'tel', ac: 'tel', val: phone, set: setPhone, ph: '10-digit number' },
          ] as const).map(({ id, label, type, ac, val, set, ph }) => (
            <div key={id} className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#c9d9ff]" htmlFor={id}>{label}</label>
              <input
                id={id}
                type={type}
                autoComplete={ac}
                inputMode={type === 'tel' ? 'numeric' : undefined}
                value={val}
                onChange={(ev) => set(ev.target.value)}
                placeholder={ph}
                className="h-12 w-full rounded-2xl border border-[#26385d] bg-[#0a1120] px-4 text-sm text-[#f7f9ff] outline-none transition placeholder:text-[#7887a3] focus:border-[#8eb0ff] focus:ring-2 focus:ring-[#8eb0ff]/20"
              />
            </div>
          ))}

          {error && <p className="text-xs text-[#ffb8bd]" role="alert">{error}</p>}

          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#dce7ff] px-5 text-sm font-bold text-[#0a1530] transition hover:bg-[#c6d8ff]"
          >
            Join the session →
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── HLS Video Player ────────────────────────────────────────────────────────

function PremiereVideoPlayer({
  src,
  liveStartsAt,
}: {
  src: string
  liveStartsAt: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const lastTimeRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [showCta, setShowCta] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const isHls = src.includes('.m3u8')

    const onReady = () => {
      const offsetSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
      const target = Math.min(Math.max(0, offsetSec), video.duration - 0.5)
      lastTimeRef.current = target
      video.currentTime = target
      video.muted = true
      void video.play().catch(() => {})
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ startPosition: -1 })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, onReady)
    } else {
      // Native HLS (Safari) or MP4
      video.src = src
      video.addEventListener('loadedmetadata', onReady, { once: true })
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (!isHls || !Hls.isSupported()) {
        video.removeEventListener('loadedmetadata', onReady)
      }
    }
  }, [src, liveStartsAt])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else void v.pause()
  }

  function unmute() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setMuted(false)
  }

  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
      <video
        ref={videoRef}
        className="h-full w-full rounded-[1.4rem] object-contain"
        playsInline
        muted
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeking={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeked={(e) => {
          const v = e.currentTarget
          const expectedSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
          if (v.currentTime < expectedSec - 120 || v.currentTime > expectedSec + 30) {
            const target = Math.min(Math.max(0, expectedSec), v.duration - 0.5)
            lastTimeRef.current = target
            v.currentTime = target
          }
        }}
        onClick={togglePlay}
      />

      {/* Top gradient overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[1.4rem] bg-gradient-to-b from-black/60 to-transparent" />

      {/* Bottom gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-[1.4rem] bg-gradient-to-t from-black/70 to-transparent" />

      {/* Paused overlay */}
      {paused && (
        <button
          type="button"
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center rounded-[1.4rem] bg-black/50"
          onClick={togglePlay}
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
            <svg className="size-9 translate-x-1 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Unmute prompt — shown while video plays muted */}
      {muted && !paused && (
        <button
          type="button"
          aria-label="Unmute"
          className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm ring-1 ring-white/20 transition hover:bg-black/90 active:scale-95"
          onClick={unmute}
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          Tap to unmute
        </button>
      )}

      {/* Fullscreen button */}
      <button
        type="button"
        aria-label="Fullscreen"
        className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
        onClick={() => { void videoRef.current?.requestFullscreen() }}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      </button>

      {/* Bottom CTA — tap to reveal */}
      <button
        type="button"
        aria-label="Show info"
        className="absolute bottom-4 left-4 flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
        onClick={() => setShowCta((p) => !p)}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showCta && (
        <div className="absolute inset-x-4 bottom-16 rounded-2xl border border-white/10 bg-black/80 px-5 py-4 backdrop-blur-xl">
          <p className="text-sm font-semibold text-white">Ready to take the next step?</p>
          <p className="mt-1 text-xs text-[#a0b4d6]">Talk to your mentor after this session to get started.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function LivePremierePage() {
  const { data, isError } = useQuery({
    queryKey: ['premiere', 'state'],
    queryFn: fetchPremiereState,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const [prospect, setProspect] = useState<ProspectInfo | null>(() => loadProspect())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const registeredRef = useRef(false)

  const state = data?.state ?? 'upcoming'
  const viewerCount = useViewerCount(data?.viewer_count ?? 0, state === 'waiting' || state === 'live')
  const firstName = prospect?.name.trim().split(/\s+/)[0] ?? ''
  const wish = resolveWish()

  // Tick for countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  // Register viewer when prospect + state known — re-register on session_hour change
  const lastRegisteredHour = useRef<number | null>(null)
  useEffect(() => {
    if (!prospect || !data) return
    if (lastRegisteredHour.current === data.session_hour) return
    lastRegisteredHour.current = data.session_hour
    void postSilent('/api/v1/other/premiere/register', {
      viewer_id: prospect.viewer_id,
      name: prospect.name,
      city: prospect.city,
      phone: prospect.phone,
      session_hour: data.session_hour,
      state: data.state,
    })
  }, [prospect, data])

  // Heartbeat every 15s
  useEffect(() => {
    if (!prospect || !data || (state !== 'waiting' && state !== 'live')) return
    const sessionHour = data.session_hour
    const id = window.setInterval(() => {
      void postSilent('/api/v1/other/premiere/heartbeat', {
        viewer_id: prospect.viewer_id,
        session_hour: sessionHour,
        state,
      })
    }, 15_000)
    return () => window.clearInterval(id)
  }, [prospect, data, state])

  // Registration form gate
  if (!prospect) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
          <ProspectForm
            onSubmit={(info) => {
              setProspect(info)
              registeredRef.current = false
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
      {state === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.07),transparent_55%)]" />
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">

        {/* Header */}
        <header className="rounded-[2rem] border border-white/10 bg-muted/40 px-5 py-4 backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f5f8ff]">Private Live Session</h1>
            </div>
            <div className="flex items-center gap-3">
              {(state === 'waiting' || state === 'live') && viewerCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-red-300 tabular-nums transition-all duration-700">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                  </span>
                  {viewerCount} watching
                </span>
              )}
              {state === 'live' && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_14px_rgba(220,38,38,0.55)]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-400" />
                  </span>
                  Live
                </span>
              )}
              {data && (
                <p className="hidden rounded-full border border-[#3f537d] bg-[#0b1120] px-4 py-2 text-[11px] font-semibold text-[#c9d9ff] sm:block">
                  {formatDateIST(data.live_starts_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Greeting bar */}
        <div className="mt-4 rounded-[1.6rem] border border-white/8 bg-white/[0.035] px-5 py-4 backdrop-blur-xl">
          <p className="text-base font-medium text-[#c9d9ff]">
            {wish}, <span className="font-bold text-[#f7f9ff]">{firstName}</span> 👋
          </p>
          <p className="mt-0.5 text-sm text-[#7a94c4]">
            {prospect.city} · {prospect.phone}
          </p>
        </div>

        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
          {isError && (
            <div className="rounded-[2rem] border border-[#5b2327] bg-[#100708] px-6 py-8 text-center" role="alert">
              <p className="text-base font-semibold text-[#ffb8bd]">Could not load session info.</p>
              <p className="mt-2 text-sm text-[#d6c3c7]">Please refresh the page.</p>
            </div>
          )}

          {/* UPCOMING */}
          {state === 'upcoming' && data && (
            <section className="w-full max-w-2xl space-y-4">
              <div className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-8 py-10 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9db0d6]">Exclusive live session</p>
                <p className="mt-4 text-[clamp(3rem,8vw,5rem)] font-bold tabular-nums tracking-tight text-[#f7f9ff]">
                  {formatTimeIST(data.live_starts_at)}
                </p>
                <p className="mt-3 text-sm font-medium text-[#7a94c4]">
                  Waiting room opens at {formatTimeIST(data.waiting_starts_at)} — join a few minutes early
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['Format', 'Live video', 'Real-time session'],
                  ['Access', 'Private link', 'Invited only'],
                  ['Action', 'Join on time', 'Limited seats'],
                ] as const).map(([label, title, sub]) => (
                  <div key={label} className="rounded-[1.4rem] border border-white/8 bg-muted/30 px-4 py-4 text-center backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0d6]">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-[#f0f4ff]">{title}</p>
                    <p className="mt-0.5 text-xs text-[#7a94c4]">{sub}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* WAITING */}
          {state === 'waiting' && data && (
            <section className="w-full max-w-2xl rounded-[2.25rem] border border-indigo-500/20 bg-[linear-gradient(160deg,rgba(99,102,241,0.08),rgba(255,255,255,0.03))] px-8 py-14 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#a5b4fc]">Starting in</p>
              <p className="mt-6 text-[clamp(4rem,12vw,7rem)] font-bold tabular-nums leading-none tracking-tight text-[#f7f9ff]">
                {formatCountdown(data.live_starts_at, nowMs)}
              </p>
              <p className="mt-6 text-sm font-medium text-[#818cf8]">
                Your session is about to go live, {firstName}
              </p>
            </section>
          )}

          {/* LIVE */}
          {state === 'live' && data?.video_url && (
            <LiveSection
              videoUrl={data.video_url}
              liveStartsAt={data.live_starts_at}
              firstName={firstName}
              viewerId={prospect.viewer_id}
              data={data}
            />
          )}
          {state === 'live' && !data?.video_url && (
            <div className="w-full max-w-2xl rounded-[2.25rem] border border-white/8 bg-muted/30 px-8 py-12 text-center">
              <p className="text-sm text-[#7a94c4]">Video not configured — set <code className="text-xs">premiere_video_url</code> in Settings.</p>
            </div>
          )}

          {/* ENDED */}
          {state === 'ended' && (
            <section className="w-full max-w-2xl space-y-5 rounded-[2.25rem] border border-white/8 bg-muted/30 px-8 py-12 text-center backdrop-blur-2xl">
              <p className="text-2xl font-semibold text-[#f7f9ff]">Today's session has ended</p>
              <p className="text-base text-[#7a94c4]">You've taken the first step. Reach out to your mentor to move forward.</p>
              <button
                type="button"
                className="inline-flex h-13 items-center justify-center rounded-2xl bg-[#dce7ff] px-8 py-3.5 text-sm font-bold text-[#0a1530] transition hover:bg-[#c6d8ff]"
                onClick={() => {
                  const wa = `https://wa.me/?text=Hi, I just watched the Myle session. I'm interested to know more.`
                  window.open(wa, '_blank', 'noopener')
                }}
              >
                Talk to your mentor →
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

// Separate component so progress tracking hooks only mount during live state
function LiveSection({
  videoUrl,
  liveStartsAt,
  firstName,
  viewerId,
  data,
}: {
  videoUrl: string
  liveStartsAt: string
  firstName: string
  viewerId: string
  data: PremiereData
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const progressSentRef = useRef({ pct10: false, pct70: false, completed: false })

  // Progress tracking every 25s
  useEffect(() => {
    const sessionHour = data.session_hour
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!v || !v.duration) return
      const pct = v.currentTime / v.duration
      const completed = pct >= 0.95
      void postSilent('/api/v1/other/premiere/progress', {
        viewer_id: viewerId,
        session_hour: sessionHour,
        current_time_sec: v.currentTime,
        percentage_watched: pct,
        watch_completed: completed,
      })
      // Score milestones
      if (!progressSentRef.current.pct70 && pct >= 0.70) {
        progressSentRef.current.pct70 = true
      }
      if (!progressSentRef.current.completed && completed) {
        progressSentRef.current.completed = true
      }
    }, 25_000)
    return () => window.clearInterval(id)
  }, [viewerId])

  return (
    <section className="w-full overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)] backdrop-blur-2xl">
      <div className="bg-[#070d1d] p-3 sm:p-4">
        {/* Pass ref externally for progress tracking */}
        <PremiereVideoPlayerWithRef
          src={videoUrl}
          liveStartsAt={liveStartsAt}
          externalRef={videoRef}
        />
        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.045] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-white">You're in, {firstName}</p>
              <p className="mt-0.5 text-sm text-[#b6c6e7]">Session is live right now — watch till the end</p>
            </div>
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
  )
}

function PremiereVideoPlayerWithRef({
  src,
  liveStartsAt,
  externalRef,
}: {
  src: string
  liveStartsAt: string
  externalRef: React.RefObject<HTMLVideoElement | null>
}) {
  const lastTimeRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [showCta, setShowCta] = useState(false)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    const video = externalRef.current
    if (!video) return
    const isHls = src.includes('.m3u8')

    const onReady = () => {
      const offsetSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
      const target = Math.min(Math.max(0, offsetSec), video.duration - 0.5)
      lastTimeRef.current = target
      video.currentTime = target
      video.muted = true
      void video.play().catch(() => {})
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, onReady)
    } else {
      video.src = src
      video.addEventListener('loadedmetadata', onReady, { once: true })
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (!isHls || !Hls.isSupported()) {
        video.removeEventListener('loadedmetadata', onReady)
      }
    }
  }, [src, liveStartsAt, externalRef])

  function togglePlay() {
    const v = externalRef.current
    if (!v) return
    if (v.paused) void v.play()
    else void v.pause()
  }

  function unmute() {
    const v = externalRef.current
    if (!v) return
    v.muted = false
    setMuted(false)
  }

  return (
    <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
      <video
        ref={externalRef}
        className="h-full w-full rounded-[1.4rem] object-contain"
        playsInline
        muted
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeking={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeked={(e) => {
          const v = e.currentTarget
          const expectedSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
          if (v.currentTime < expectedSec - 120 || v.currentTime > expectedSec + 30) {
            const target = Math.min(Math.max(0, expectedSec), v.duration - 0.5)
            lastTimeRef.current = target
            v.currentTime = target
          }
        }}
        onClick={togglePlay}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[1.4rem] bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-[1.4rem] bg-gradient-to-t from-black/70 to-transparent" />

      {paused && (
        <button
          type="button"
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center rounded-[1.4rem] bg-black/50"
          onClick={togglePlay}
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
            <svg className="size-9 translate-x-1 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Unmute prompt — shown while video plays muted */}
      {muted && !paused && (
        <button
          type="button"
          aria-label="Unmute"
          className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm ring-1 ring-white/20 transition hover:bg-black/90 active:scale-95"
          onClick={unmute}
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          Tap to unmute
        </button>
      )}

      <button
        type="button"
        aria-label="Fullscreen"
        className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
        onClick={() => { void externalRef.current?.requestFullscreen() }}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Info"
        className="absolute bottom-4 left-4 flex size-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
        onClick={() => setShowCta((p) => !p)}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showCta && (
        <div className="absolute inset-x-4 bottom-16 rounded-2xl border border-white/10 bg-black/80 px-5 py-4 backdrop-blur-xl">
          <p className="text-sm font-semibold text-white">Ready to take the next step?</p>
          <p className="mt-1 text-xs text-[#a0b4d6]">Talk to your mentor after this session to get started.</p>
        </div>
      )}
    </div>
  )
}
