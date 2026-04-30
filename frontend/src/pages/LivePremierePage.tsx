import { type FormEvent, useEffect, useRef, useState } from 'react'
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

type ProspectInfo = {
  name: string
  city: string
  phone: string
}

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

function resolveWish(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

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
      setError('Enter a valid WhatsApp number.')
      return
    }
    setError('')
    const info: ProspectInfo = { name: name.trim(), city: city.trim(), phone: phone.trim() }
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
          This is a private, invitation-only session. Enter your details to get access.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#c9d9ff]" htmlFor="p-name">Full name</label>
            <input
              id="p-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="h-12 w-full rounded-2xl border border-[#26385d] bg-[#0a1120] px-4 text-sm text-[#f7f9ff] outline-none transition placeholder:text-[#7887a3] focus:border-[#8eb0ff] focus:ring-2 focus:ring-[#8eb0ff]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#c9d9ff]" htmlFor="p-city">City</label>
            <input
              id="p-city"
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Your city"
              className="h-12 w-full rounded-2xl border border-[#26385d] bg-[#0a1120] px-4 text-sm text-[#f7f9ff] outline-none transition placeholder:text-[#7887a3] focus:border-[#8eb0ff] focus:ring-2 focus:ring-[#8eb0ff]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#c9d9ff]" htmlFor="p-phone">WhatsApp number</label>
            <input
              id="p-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
              className="h-12 w-full rounded-2xl border border-[#26385d] bg-[#0a1120] px-4 text-sm text-[#f7f9ff] outline-none transition placeholder:text-[#7887a3] focus:border-[#8eb0ff] focus:ring-2 focus:ring-[#8eb0ff]/20"
            />
          </div>

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

export function LivePremierePage() {
  const { data, isError } = useQuery({
    queryKey: ['premiere', 'state'],
    queryFn: fetchPremiereState,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const [prospect, setProspect] = useState<ProspectInfo | null>(() => loadProspect())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoplayedRef = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (data?.state === 'live' && videoRef.current && !autoplayedRef.current) {
      autoplayedRef.current = true
      void videoRef.current.play().catch(() => { /* browser policy */ })
    }
    if (data?.state !== 'live') autoplayedRef.current = false
  }, [data?.state])

  const state = data?.state ?? 'upcoming'
  const videoSrc = data?.video_url ?? null
  const firstName = prospect?.name.trim().split(/\s+/)[0] ?? ''
  const wish = resolveWish()

  if (!prospect) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
          <ProspectForm onSubmit={(info) => setProspect(info)} />
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
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_32px_120px_-72px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f5f8ff]">Private Live Session</h1>
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
              {data && (
                <p className="rounded-full border border-[#3f537d] bg-[#0b1120] px-4 py-2 text-[11px] font-semibold text-[#c9d9ff]">
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
                <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-center backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0d6]">Format</p>
                  <p className="mt-2 text-sm font-semibold text-[#f0f4ff]">Live video</p>
                  <p className="mt-0.5 text-xs text-[#7a94c4]">Real-time session</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-center backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0d6]">Access</p>
                  <p className="mt-2 text-sm font-semibold text-[#f0f4ff]">Private link</p>
                  <p className="mt-0.5 text-xs text-[#7a94c4]">Invited only</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-center backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0d6]">Action</p>
                  <p className="mt-2 text-sm font-semibold text-[#f0f4ff]">Join on time</p>
                  <p className="mt-0.5 text-xs text-[#7a94c4]">Limited seats</p>
                </div>
              </div>
            </section>
          )}

          {/* WAITING ROOM */}
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
          {state === 'live' && data && (
            <section className="w-full overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)] backdrop-blur-2xl">
              <div className="bg-[#070d1d] p-3 sm:p-4">
                <div className="relative">
                  {videoSrc ? (
                    <video
                      ref={videoRef}
                      className="aspect-video w-full rounded-[1.4rem] bg-black object-contain"
                      src={videoSrc}
                      playsInline
                      controls
                      controlsList="nodownload noplaybackrate"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-[1.4rem] bg-black">
                      <p className="text-sm text-[#7a94c4]">Video not configured — set <code className="text-xs">premiere_video_url</code> in Settings.</p>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-[1.4rem] bg-gradient-to-t from-[#030806] to-transparent" />
                </div>

                <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.045] px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-white">You're in, {firstName}</p>
                      <p className="mt-0.5 text-sm text-[#b6c6e7]">This session is live right now — watch till the end</p>
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
          )}

          {/* ENDED */}
          {state === 'ended' && (
            <section className="w-full max-w-2xl rounded-[2.25rem] border border-white/8 bg-white/[0.03] px-8 py-12 text-center backdrop-blur-2xl">
              <p className="text-2xl font-semibold text-[#f7f9ff]">Today's session has ended</p>
              <p className="mt-3 text-base text-[#7a94c4]">Reach out to your team contact for next steps.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
