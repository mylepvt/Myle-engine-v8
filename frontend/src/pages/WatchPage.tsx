import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LockKeyhole, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { apiUrl } from '@/lib/api'

type WatchPageData = {
  token: string
  title: string
  lead_name: string
  masked_phone: string
  expires_at: string | null
  access_granted: boolean
  stream_url: string | null
  watch_started: boolean
  watch_completed: boolean
  social_proof_count: number | null
  total_seats: number | null
  seats_left: number | null
  trust_note: string | null
}

type WatchEventResponse = {
  ok: boolean
  watch_started: boolean
  watch_completed: boolean
}

const GENERIC_PROSPECT_HEADING = 'A quick introduction to Myle'
const GENERIC_PROSPECT_SUBLINE = 'Take a few minutes to see how Myle works and what comes next.'

function resolveWish(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

function formatRemaining(expiresAt: string | null, nowMs: number): string {
  if (!expiresAt) return '50m starts when this room opens'
  const diff = new Date(expiresAt).getTime() - nowMs
  if (diff <= 0) return 'Expired'
  const totalSeconds = Math.ceil(diff / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s left`
}

function formatPlaybackTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const safeSeconds = Math.max(0, Math.floor(value))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function easeOutCubic(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return 1 - Math.pow(1 - clamped, 3)
}

function resolveGreetingName(rawValue: string | null | undefined): string | null {
  const value = (rawValue || '').trim()
  if (!value) return null
  const first = value.split(/\s+/)[0]?.trim() || ''
  if (!first || /^(there|lead|user|prospect)$/i.test(first)) return null
  return first
}

function resolveProspectHeading(rawValue: string | null | undefined): string {
  const value = (rawValue || '').trim()
  if (!value || /^enrollment video$/i.test(value)) {
    return GENERIC_PROSPECT_HEADING
  }

  if (/\.(mp4|mov|webm|m4v|mpeg|mpg)$/i.test(value) || /[|_/]/.test(value) || value.length > 56) {
    return GENERIC_PROSPECT_HEADING
  }

  const letters = value.replace(/[^A-Za-z]/g, '')
  const uppercaseLetters = letters.replace(/[^A-Z]/g, '').length
  if (letters.length >= 10 && uppercaseLetters / letters.length > 0.72) {
    return GENERIC_PROSPECT_HEADING
  }

  return value
}

function normalizeRoomError(rawValue: string | null | undefined, fallback: string): string {
  const value = (rawValue || '').trim()
  if (!value) return fallback

  if (/^failed to fetch$/i.test(value)) {
    return 'This private link is temporarily unavailable.'
  }

  if (/operation is not supported/i.test(value) || /no supported sources/i.test(value)) {
    return 'This video is not available on this device right now.'
  }

  return value
}

async function readJsonError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}))
  let detail = fallback
  if (typeof body === 'object' && body !== null) {
    if ('detail' in body && typeof (body as { detail?: unknown }).detail === 'string') {
      detail = String((body as { detail?: string }).detail || fallback)
    } else {
      const wrapped = (body as { error?: { message?: string } }).error?.message
      if (typeof wrapped === 'string' && wrapped.trim()) {
        detail = wrapped
      }
    }
  }
  return new Error(detail || fallback)
}

export function WatchPage() {
  const { token } = useParams<{ token: string }>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const maxAllowedTimeRef = useRef(0)
  const startRequestedRef = useRef(false)
  const completionRequestedRef = useRef(false)

  const [data, setData] = useState<WatchPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [playMarked, setPlayMarked] = useState(false)
  const [watchCompleted, setWatchCompleted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!playing || !token || !data?.access_granted) return
    const id = window.setInterval(() => {
      void fetch(apiUrl(`/api/v1/watch/${token}/heartbeat`), {
        method: 'POST',
        credentials: 'include',
      })
    }, 15_000)
    return () => window.clearInterval(id)
  }, [playing, token, data?.access_granted])

  useEffect(() => {
    if (!token) {
      setError('Invalid link.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetch(apiUrl(`/api/v1/watch/${token}`), { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw await readJsonError(res, `HTTP ${res.status}`)
        return res.json() as Promise<WatchPageData>
      })
      .then((payload) => {
        setData(payload)
        setPlayMarked(payload.watch_started)
        setWatchCompleted(payload.watch_completed)
        startRequestedRef.current = payload.watch_started
        completionRequestedRef.current = payload.watch_completed
        maxAllowedTimeRef.current = 0
        setPlaying(false)
        setPlayerError(null)
        setCurrentSeconds(0)
        setDurationSeconds(0)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(normalizeRoomError(err instanceof Error ? err.message : null, 'Could not load secure room.'))
        setLoading(false)
      })
  }, [token])

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${resolveProspectHeading(data?.title)} | Myle`
    return () => {
      document.title = previousTitle
    }
  }, [data?.title])

  const wish = useMemo(() => resolveWish(new Date(nowMs)), [nowMs])
  const greetingName = useMemo(() => resolveGreetingName(data?.lead_name), [data?.lead_name])
  const heroGreeting = greetingName ? `${wish}, ${greetingName}` : wish
  const heroHeading = useMemo(() => resolveProspectHeading(data?.title), [data?.title])
  const countdown = useMemo(
    () => (data ? formatRemaining(data.expires_at, nowMs) : ''),
    [data, nowMs],
  )
  const videoSrc = data?.stream_url ? apiUrl(data.stream_url) : null
  const playbackWindowSeconds = durationSeconds > 0 ? durationSeconds : 15 * 60
  const socialProofProgress = easeOutCubic(playbackWindowSeconds > 0 ? currentSeconds / playbackWindowSeconds : 0)
  const socialProofStart = data?.social_proof_count != null
    ? Math.max(data.social_proof_count - Math.min(24, Math.max(8, Math.round(data.social_proof_count * 0.06))), 0)
    : null
  const displayedSocialProof = data?.social_proof_count != null && socialProofStart != null
    ? Math.round(socialProofStart + (data.social_proof_count - socialProofStart) * socialProofProgress)
    : null
  const seatsLeftStart = data?.seats_left != null
    ? Math.min(
        data.total_seats ?? Number.MAX_SAFE_INTEGER,
        data.seats_left + Math.min(6, Math.max(2, Math.round((data.total_seats ?? data.seats_left) * 0.12))),
      )
    : null
  const displayedSeatsLeft = data?.seats_left != null && seatsLeftStart != null
    ? Math.max(
        data.seats_left,
        Math.round(seatsLeftStart - (seatsLeftStart - data.seats_left) * socialProofProgress),
      )
    : null
  const intakeHighlights = [
    displayedSocialProof != null ? `${displayedSocialProof} applications reviewed` : null,
    displayedSeatsLeft != null ? `${displayedSeatsLeft} places currently available` : null,
  ].filter((value): value is string => Boolean(value))
  const intakeSummary = intakeHighlights.join(' • ')
  const showSoftSnapshot = Boolean(intakeSummary || data?.trust_note)
  const progressPercent = durationSeconds > 0 ? Math.min(100, (currentSeconds / durationSeconds) * 100) : 0
  const progressLabel = `${formatPlaybackTime(currentSeconds)} / ${formatPlaybackTime(durationSeconds)}`
  const playerButtonLabel = playing
    ? 'Pause'
    : watchCompleted
      ? 'Play again'
      : currentSeconds > 0
        ? 'Resume'
        : 'Play introduction'
  const playerStatusTitle = watchCompleted ? 'Thanks for watching' : playMarked ? 'Now playing' : 'Press play to begin'
  const playerStatusBody = watchCompleted
    ? 'You can replay this introduction anytime while this private access window is active.'
    : playMarked
      ? 'Keep watching for the full introduction.'
      : 'A short private introduction is ready for you.'

  async function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setUnlocking(true)
    setUnlockError(null)
    try {
      const res = await fetch(apiUrl(`/api/v1/watch/${token}/unlock`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) throw await readJsonError(res, 'Could not verify number.')
      const payload = (await res.json()) as WatchPageData
      setData(payload)
      setPlayMarked(payload.watch_started)
      setWatchCompleted(payload.watch_completed)
      startRequestedRef.current = payload.watch_started
      completionRequestedRef.current = payload.watch_completed
      maxAllowedTimeRef.current = 0
      setPlaying(false)
      setPlayerError(null)
      setCurrentSeconds(0)
      setDurationSeconds(0)
      setPhone('')
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Could not verify number.')
    } finally {
      setUnlocking(false)
    }
  }

  async function handleFirstPlay() {
    if (!token || !data?.access_granted || startRequestedRef.current) return
    startRequestedRef.current = true
    setPlayMarked(true)
    setPlayerError(null)
    try {
      const res = await fetch(apiUrl(`/api/v1/watch/${token}/play`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        throw await readJsonError(res, 'Could not start secure playback.')
      }
      const payload = (await res.json()) as WatchEventResponse
      setPlayMarked(payload.watch_started)
      if (payload.watch_completed) {
        completionRequestedRef.current = true
        setWatchCompleted(true)
      }
      setData((current) =>
        current
          ? {
              ...current,
              watch_started: payload.watch_started,
              watch_completed: payload.watch_completed,
            }
          : current,
      )
    } catch (err) {
      startRequestedRef.current = false
      setPlayMarked(false)
      setPlayerError(err instanceof Error ? err.message : 'Could not start secure playback.')
      videoRef.current?.pause()
    }
  }

  async function handleCompleteWatch() {
    if (!token || !data?.access_granted || completionRequestedRef.current) return
    completionRequestedRef.current = true
    setCompleting(true)
    setPlayerError(null)
    try {
      const res = await fetch(apiUrl(`/api/v1/watch/${token}/complete`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        throw await readJsonError(res, 'Could not complete secure playback.')
      }
      const payload = (await res.json()) as WatchEventResponse
      startRequestedRef.current = payload.watch_started
      setPlayMarked(payload.watch_started)
      setWatchCompleted(payload.watch_completed)
      setData((current) =>
        current
          ? {
              ...current,
              watch_started: payload.watch_started,
              watch_completed: payload.watch_completed,
            }
          : current,
      )
    } catch (err) {
      completionRequestedRef.current = false
      setPlayerError(err instanceof Error ? err.message : 'Could not complete secure playback.')
    } finally {
      setCompleting(false)
    }
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    setPlayerError(null)
    try {
      if (video.paused) {
        if (watchCompleted && durationSeconds > 0 && currentSeconds >= Math.max(0, durationSeconds - 1)) {
          video.currentTime = 0
          maxAllowedTimeRef.current = 0
          setCurrentSeconds(0)
        }
        await video.play()
        return
      }
      video.pause()
    } catch (err) {
      setPlayerError(err instanceof Error ? err.message : 'Could not control secure playback.')
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#233f74_0%,#101b39_28%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(160,195,255,0.18),transparent_58%)]" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-[#3158a4]/16 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_32px_120px_-72px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#f5f8ff]">Your private introduction</h1>
            </div>
            <div className="flex items-center gap-3">
              {data?.access_granted ? (
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_14px_rgba(220,38,38,0.55)]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-400" />
                  </span>
                  Live
                </span>
              ) : null}
              {data ? (
                <p className="rounded-full border border-[#3f537d] bg-[#0b1120] px-4 py-2 text-sm font-semibold text-[#c9d9ff] shadow-[0_14px_34px_-24px_rgba(132,165,255,0.35)]">
                  {countdown}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-5 py-5">
          {loading ? (
            <>
              <Skeleton className="h-28 w-full rounded-[2rem] bg-white/[0.06]" />
              <Skeleton className="h-[24rem] w-full rounded-[2rem] bg-white/[0.06]" />
            </>
          ) : error ? (
            <section
              className="rounded-[2rem] border border-[#5b2327] bg-[linear-gradient(180deg,rgba(34,12,14,0.98),rgba(16,7,8,0.98))] px-6 py-8 text-center shadow-[0_32px_110px_-70px_rgba(0,0,0,0.9)]"
              role="alert"
            >
              <p className="text-base font-semibold text-[#ffb8bd]">{error}</p>
              <p className="mt-2 text-sm text-[#d6c3c7]">
                Please ask your team contact to send a fresh access link.
              </p>
            </section>
          ) : data ? (
            <>
              <section className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] px-5 py-6 shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:px-8 sm:py-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-base font-medium text-[#b2c1de]">{heroGreeting}</p>
                    <h2 className="mt-3 max-w-xl text-[clamp(2rem,4vw,3.55rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#f7f9ff]">
                      {heroHeading}
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-relaxed text-[#aab8d3]">
                      {GENERIC_PROSPECT_SUBLINE}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-[#19335e] px-4 py-1.5 text-white shadow-[0_18px_38px_-30px_rgba(25,51,94,0.95)]">
                      <ShieldCheck className="mr-1 size-3.5" />
                      Private access
                    </Badge>
                    <Badge variant="outline" className="border-[#3f537d] bg-[#0b1120] px-4 py-1.5 text-[#c9d9ff]">
                      {data.masked_phone}
                    </Badge>
                  </div>
                </div>
              </section>

              {showSoftSnapshot ? (
                <section className="rounded-[1.8rem] border border-white/8 bg-white/[0.035] px-5 py-4 shadow-[0_24px_90px_-70px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:px-6">
                  {intakeSummary ? (
                    <p className="text-sm font-medium text-[#d9e7ff]">{intakeSummary}</p>
                  ) : null}
                  {data.trust_note ? (
                    <p className={`${intakeSummary ? 'mt-1.5' : ''} text-sm leading-relaxed text-[#9eabc7]`}>
                      {data.trust_note}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {!data.access_granted ? (
                <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-[linear-gradient(170deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-6 shadow-[0_34px_120px_-80px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-[#112549] p-3 text-[#d2e3ff]">
                      <LockKeyhole className="size-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#f7f9ff]">Continue with your number</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#aab8d3]">
                        Use the same mobile number you shared with your team.
                      </p>
                    </div>
                  </div>

                  <form className="mt-5 space-y-3" onSubmit={(e) => void handleUnlock(e)}>
                    <label className="block text-sm font-medium text-[#dfe8ff]" htmlFor="watch-phone">
                      Registered mobile number
                    </label>
                    <input
                      id="watch-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter the same number"
                      className="h-12 w-full rounded-2xl border border-[#26385d] bg-[#0a1120] px-4 text-base text-[#f7f9ff] outline-none transition placeholder:text-[#7887a3] focus:border-[#8eb0ff] focus:ring-2 focus:ring-[#8eb0ff]/20"
                    />
                    {unlockError ? (
                      <p className="text-sm text-[#ffb8bd]" role="alert">
                        {normalizeRoomError(unlockError, 'Could not verify number.')}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={unlocking}
                      className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#dce7ff] px-5 text-sm font-semibold text-[#0a1530] transition hover:bg-[#c6d8ff] disabled:opacity-60"
                    >
                      {unlocking ? 'Verifying…' : 'Continue'}
                    </button>
                  </form>
                </section>
              ) : (
                <section className="overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)] backdrop-blur-2xl">
                  <div className="bg-[#070d1d] p-3 sm:p-4">
                    {videoSrc ? (
                      <>
                        <div className="relative">
                          <video
                            ref={videoRef}
                            className="pointer-events-none aspect-video h-full w-full rounded-[1.4rem] bg-black object-contain select-none"
                            src={videoSrc}
                            crossOrigin="use-credentials"
                            playsInline
                            preload="metadata"
                            controls={false}
                            controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
                            disablePictureInPicture
                            tabIndex={-1}
                            onContextMenu={(e) => e.preventDefault()}
                            onLoadedMetadata={(e) => {
                              const nextDuration = Number.isFinite(e.currentTarget.duration)
                                ? e.currentTarget.duration
                                : 0
                              setDurationSeconds(nextDuration)
                              setCurrentSeconds(e.currentTarget.currentTime || 0)
                              maxAllowedTimeRef.current = Math.max(maxAllowedTimeRef.current, e.currentTarget.currentTime || 0)
                            }}
                            onPlay={() => {
                              setPlaying(true)
                              if (!playMarked) {
                                void handleFirstPlay()
                              }
                            }}
                            onPause={() => setPlaying(false)}
                            onTimeUpdate={(e) => {
                              const nextTime = e.currentTarget.currentTime || 0
                              const nextDuration = Number.isFinite(e.currentTarget.duration)
                                ? e.currentTarget.duration
                                : 0
                              setCurrentSeconds(nextTime)
                              if (nextDuration > 0) {
                                setDurationSeconds(nextDuration)
                              }
                              maxAllowedTimeRef.current = Math.max(maxAllowedTimeRef.current, nextTime)
                              if (!watchCompleted && nextDuration > 0 && nextTime / nextDuration >= 0.985) {
                                void handleCompleteWatch()
                              }
                            }}
                            onSeeking={(e) => {
                              const video = e.currentTarget
                              const allowedTime = maxAllowedTimeRef.current
                              if (video.currentTime > allowedTime + 0.35) {
                                video.currentTime = allowedTime
                              }
                            }}
                            onEnded={() => {
                              setPlaying(false)
                              setCurrentSeconds(durationSeconds)
                              maxAllowedTimeRef.current = durationSeconds
                              void handleCompleteWatch()
                            }}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-[1.4rem] bg-gradient-to-t from-[#030806] to-transparent" />
                        </div>

                        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.045] p-4 text-white/90">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-white">{playerStatusTitle}</p>
                              <p className="mt-1 text-sm leading-relaxed text-[#b6c6e7]">{playerStatusBody}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void togglePlayback()}
                              disabled={!videoSrc || completing}
                              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#dce7ff] px-5 text-sm font-semibold text-[#0a1530] transition hover:bg-[#c6d8ff] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {playerButtonLabel}
                            </button>
                          </div>

                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-[#8fb4ff] transition-[width]"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                            <span>{currentSeconds > 0 || watchCompleted ? progressLabel : null}</span>
                            <span>{watchCompleted ? 'Thanks for watching.' : 'Please watch through to the end.'}</span>
                          </div>

                          {completing ? <p className="mt-3 text-xs text-[#8fb4ff]">Finishing up…</p> : null}
                          {playerError ? (
                            <p className="mt-3 text-xs text-red-300" role="alert">
                              {normalizeRoomError(playerError, 'Could not control secure playback.')}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-[1.4rem] bg-black text-sm text-white/70">
                        Preparing your video…
                      </div>
                    )}
                  </div>
                </section>
              )}

            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}
