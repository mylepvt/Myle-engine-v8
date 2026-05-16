import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { apiUrl } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type Day6LiveData = {
  lead_name: string
  slot: string
  state: 'upcoming' | 'waiting' | 'live' | 'ended'
  video_url: string | null
  waiting_starts_at: string
  live_starts_at: string
  live_ends_at: string
  viewer_count: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  if (!first || /^(there|lead|user|prospect)$/i.test(first)) return 'Champion'
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function resolveWish(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
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

// ─── Viewer count (60-100 range) ─────────────────────────────────────────────

function useDay6ViewerCount(serverCount: number, state: string): number {
  const baseRef = useRef(serverCount || 68)
  const [display, setDisplay] = useState(baseRef.current)

  useEffect(() => {
    if (serverCount) baseRef.current = Math.min(100, Math.max(60, serverCount))
  }, [serverCount])

  useEffect(() => {
    if (state !== 'waiting' && state !== 'live') return
    let alive = true
    const tick = () => {
      if (!alive) return
      baseRef.current = Math.min(100, Math.max(60, baseRef.current + Math.floor(Math.random() * 7) - 3))
      setDisplay(baseRef.current)
      window.setTimeout(tick, 8000 + Math.random() * 9000)
    }
    window.setTimeout(tick, 4000 + Math.random() * 4000)
    return () => { alive = false }
  }, [state])

  return display
}

// ─── Join feed ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan',
  'Krishna','Ishaan','Shaurya','Atharva','Pranav','Advait','Dhruv','Kabir',
  'Ritvik','Aarush','Veer','Arnav','Harsh','Rohan','Karan','Rahul','Nikhil',
  'Vikram','Amit','Suresh','Mohit','Sumit','Rajesh','Ramesh','Dinesh','Sunil',
  'Aanya','Aadhya','Ananya','Pari','Anika','Navya','Diya','Riya','Priya',
  'Neha','Pooja','Sneha','Nisha','Divya','Anjali','Meera','Kavya','Ishita',
  'Khushi','Tanvi','Shruti','Sanya','Jiya','Avni','Simran','Radhika','Swati',
]

const CITIES = [
  'Mumbai','Delhi','Bengaluru','Hyderabad','Pune','Chennai','Kolkata',
  'Jaipur','Surat','Ahmedabad','Lucknow','Kanpur','Nagpur','Indore',
  'Bhopal','Patna','Vadodara','Ludhiana','Agra','Nashik','Ranchi',
  'Faridabad','Meerut','Chandigarh','Coimbatore',
]

type JoinEntry = { id: number; name: string; city: string }

function useJoinFeed(state: string, liveStartsAt: string, liveEndsAt: string): JoinEntry[] {
  const active = state === 'waiting' || state === 'live'
  const [entries, setEntries] = useState<JoinEntry[]>([])
  const idRef = useRef(0)
  const aliveRef = useRef(false)
  const stateRef = useRef(state)
  const liveStartRef = useRef(liveStartsAt)
  const liveEndRef = useRef(liveEndsAt)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { liveStartRef.current = liveStartsAt }, [liveStartsAt])
  useEffect(() => { liveEndRef.current = liveEndsAt }, [liveEndsAt])

  function nextDelay(): number {
    const st = stateRef.current
    if (st === 'waiting') return 25000 + Math.random() * 20000
    if (st === 'live') {
      const start = new Date(liveStartRef.current).getTime()
      const end = new Date(liveEndRef.current).getTime()
      const dur = Math.max(1, end - start)
      const progress = Math.min(1, Math.max(0, (Date.now() - start) / dur))
      if (progress < 0.15) return 6000 + Math.random() * 8000
      if (progress < 0.75) return 18000 + Math.random() * 20000
      return 50000 + Math.random() * 50000
    }
    return 30000
  }

  useEffect(() => {
    if (!active) return
    aliveRef.current = true
    function emit() {
      if (!aliveRef.current) return
      const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]!
      const city = CITIES[Math.floor(Math.random() * CITIES.length)]!
      setEntries(prev => [...prev.slice(-7), { id: ++idRef.current, name, city }])
      window.setTimeout(emit, nextDelay())
    }
    window.setTimeout(emit, 3000 + Math.random() * 5000)
    return () => { aliveRef.current = false }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return entries
}

function JoinFeed({ entries }: { entries: JoinEntry[] }) {
  if (entries.length === 0) return null
  const visible = entries.slice(-5)
  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-[1.6rem] border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b83a8]">Live activity</p>
      <div className="space-y-1.5">
        {visible.map((e, i) => (
          <div
            key={e.id}
            style={{ opacity: 0.35 + 0.65 * ((i + 1) / visible.length) }}
            className="flex items-center gap-2 text-[13px]"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span className="text-[#c9d9ff]">
              <span className="font-semibold">{e.name}</span>
              <span className="text-[#7a94c4]"> from {e.city} joined</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Video Player ─────────────────────────────────────────────────────────────

function Day6VideoPlayer({
  src,
  liveStartsAt,
  externalRef,
}: {
  src: string
  liveStartsAt: string
  externalRef: React.RefObject<HTMLVideoElement | null>
}) {
  const maxAllowedTimeRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = externalRef.current
    if (!video) return
    const onReady = () => {
      const offsetSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
      const target = Math.min(Math.max(0, offsetSec), video.duration - 0.5)
      maxAllowedTimeRef.current = target
      video.currentTime = target
      video.muted = true
      void video.play().catch(() => {})
    }
    video.src = src
    video.addEventListener('loadedmetadata', onReady, { once: true })
    return () => { video.removeEventListener('loadedmetadata', onReady) }
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
        className="pointer-events-none h-full w-full select-none rounded-[1.4rem] object-contain"
        playsInline
        muted
        disableRemotePlayback
        disablePictureInPicture
        controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          maxAllowedTimeRef.current = Math.max(maxAllowedTimeRef.current, e.currentTarget.currentTime || 0)
        }}
        onSeeking={(e) => {
          const v = e.currentTarget
          if (v.currentTime > maxAllowedTimeRef.current + 0.35) {
            v.currentTime = maxAllowedTimeRef.current
          }
        }}
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
        className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
        onClick={() => { void externalRef.current?.requestFullscreen() }}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      </button>
    </div>
  )
}

// ─── Live Section ─────────────────────────────────────────────────────────────

function LiveSection({
  data,
  firstName,
  joinEntries,
  token,
}: {
  data: Day6LiveData
  firstName: string
  joinEntries: JoinEntry[]
  token: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Heartbeat every 15s
  useEffect(() => {
    const slot = data.slot
    const beat = () => {
      void fetch(apiUrl('/api/v1/watch/batch/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot }),
      }).catch(() => undefined)
    }
    beat()
    const id = window.setInterval(beat, 15_000)
    return () => window.clearInterval(id)
  }, [token, data.slot])

  if (!data.video_url) {
    return (
      <div className="w-full max-w-2xl rounded-[2.25rem] border border-white/8 bg-muted/30 px-5 py-8 text-center md:px-8 md:py-12">
        <p className="text-sm text-[#7a94c4]">Video is being prepared. Please refresh in a moment.</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      <section className="overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)] backdrop-blur-2xl">
        <div className="bg-[#070d1d] p-3 sm:p-4">
          <Day6VideoPlayer
            src={data.video_url}
            liveStartsAt={data.live_starts_at}
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
      <JoinFeed entries={joinEntries} />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Day6LivePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const { data, isError } = useQuery<Day6LiveData>({
    queryKey: ['day6live', token],
    queryFn: async () => {
      if (!token) throw new Error('Missing token')
      const res = await fetch(apiUrl(`/api/v1/watch/live/day6?token=${encodeURIComponent(token)}`))
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<Day6LiveData>
    },
    enabled: !!token,
    refetchInterval: 12_000,
    refetchIntervalInBackground: true,
  })

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  const state = data?.state ?? 'upcoming'
  const viewerCount = useDay6ViewerCount(data?.viewer_count ?? 0, state)
  const joinEntries = useJoinFeed(state, data?.live_starts_at ?? '', data?.live_ends_at ?? '')
  const firstName = data ? getFirstName(data.lead_name) : ''
  const wish = resolveWish()

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#02040a] px-5 text-center text-white">
        <p className="text-base font-medium text-[#7a94c4]">This link is incomplete. Please use the link sent by your team.</p>
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
              <h1 className="mt-1 text-ds-h2">Private Live Session</h1>
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

        {/* Greeting */}
        {data && (
          <div className="mt-4 rounded-[1.6rem] border border-white/8 bg-white/[0.035] px-5 py-4 backdrop-blur-xl">
            <p className="text-base font-medium text-[#c9d9ff]">
              {wish}, <span className="font-bold text-[#f7f9ff]">{firstName}</span>
            </p>
            <p className="mt-0.5 text-sm text-[#7a94c4]">
              Session starts at {formatTimeIST(data.live_starts_at)} IST
            </p>
          </div>
        )}

        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8">

          {isError && (
            <div className="rounded-[2rem] border border-[#5b2327] bg-[#100708] px-6 py-8 text-center" role="alert">
              <p className="text-base font-semibold text-[#ffb8bd]">Could not load session.</p>
              <p className="mt-2 text-sm text-[#d6c3c7]">Please refresh or use the latest link from your team.</p>
            </div>
          )}

          {/* UPCOMING */}
          {state === 'upcoming' && data && (
            <section className="w-full max-w-2xl space-y-4">
              <div className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-5 py-8 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:px-8 md:py-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9db0d6]">Private session</p>
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
            <>
              <section className="w-full max-w-2xl rounded-[2.25rem] border border-indigo-500/20 bg-[linear-gradient(160deg,rgba(99,102,241,0.08),rgba(255,255,255,0.03))] px-5 py-10 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:px-8 md:py-14">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#a5b4fc]">Starting in</p>
                <p className="mt-6 text-[clamp(4rem,12vw,7rem)] font-bold tabular-nums leading-none tracking-tight text-[#f7f9ff]">
                  {formatCountdown(data.live_starts_at, nowMs)}
                </p>
                <p className="mt-6 text-sm font-medium text-[#818cf8]">
                  Your session is about to go live, {firstName}
                </p>
              </section>
              <JoinFeed entries={joinEntries} />
            </>
          )}

          {/* LIVE */}
          {state === 'live' && data && (
            <LiveSection
              data={data}
              firstName={firstName}
              joinEntries={joinEntries}
              token={token}
            />
          )}

          {/* ENDED */}
          {state === 'ended' && (
            <section className="w-full max-w-2xl space-y-5 rounded-[2.25rem] border border-white/8 bg-muted/30 px-5 py-8 text-center backdrop-blur-2xl md:px-8 md:py-12">
              <p className="text-2xl font-semibold text-[#f7f9ff]">Today's session has ended</p>
              <p className="text-base text-[#7a94c4]">
                {firstName ? `Well done, ${firstName}.` : 'Well done.'} Your team will follow up with the next step.
              </p>
            </section>
          )}

        </main>
      </div>
    </div>
  )
}
