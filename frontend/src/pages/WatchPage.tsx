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
  expires_at: string
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

function formatRemaining(expiresAt: string, nowMs: number): string {
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
        setError(err instanceof Error ? err.message : 'Could not load secure room.')
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fbf7ef_0%,#f5efe3_42%,#efe6d7_100%)] text-[#10231d]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        <header className="rounded-[2rem] border border-[#e9dfcf] bg-white/88 px-5 py-4 shadow-[0_24px_80px_-48px_rgba(16,35,29,0.18)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#617067]">Myle</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#10231d]">Your private introduction</h1>
            </div>
            {data ? (
              <p className="rounded-full border border-[#dccdb3] bg-[#fff8ee] px-4 py-2 text-sm font-semibold text-[#7a5d32]">
                {countdown}
              </p>
            ) : null}
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-5 py-5">
          {loading ? (
            <>
              <Skeleton className="h-28 w-full rounded-[2rem] bg-black/5" />
              <Skeleton className="h-[24rem] w-full rounded-[2rem] bg-black/5" />
            </>
          ) : error ? (
            <section className="rounded-[2rem] border border-red-200 bg-white px-6 py-8 text-center shadow-sm" role="alert">
              <p className="text-base font-semibold text-red-700">{error}</p>
              <p className="mt-2 text-sm text-[#5f655f]">
                Please ask your team contact to send a fresh access link.
              </p>
            </section>
          ) : data ? (
            <>
              <section className="rounded-[2.25rem] border border-[#ece2d2] bg-white px-5 py-6 shadow-[0_30px_90px_-58px_rgba(16,35,29,0.28)] sm:px-8 sm:py-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-base font-medium text-[#617067]">{heroGreeting}</p>
                    <h2 className="mt-3 max-w-xl text-[clamp(2rem,4vw,3.55rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#10231d]">
                      {heroHeading}
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-relaxed text-[#667168]">
                      {GENERIC_PROSPECT_SUBLINE}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-[#10392f] px-4 py-1.5 text-white shadow-sm">
                      <ShieldCheck className="mr-1 size-3.5" />
                      Private access
                    </Badge>
                    <Badge variant="outline" className="border-[#ddcfb6] bg-[#fff8ee] px-4 py-1.5 text-[#7a5d32]">
                      {data.masked_phone}
                    </Badge>
                  </div>
                </div>
              </section>

              {showSoftSnapshot ? (
                <section className="rounded-[1.8rem] border border-[#eadfcd] bg-white/80 px-5 py-4 shadow-[0_20px_70px_-60px_rgba(16,35,29,0.24)] sm:px-6">
                  {intakeSummary ? (
                    <p className="text-sm font-medium text-[#243a33]">{intakeSummary}</p>
                  ) : null}
                  {data.trust_note ? (
                    <p className={`${intakeSummary ? 'mt-1.5' : ''} text-sm leading-relaxed text-[#6a736c]`}>
                      {data.trust_note}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {!data.access_granted ? (
                <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-[#ece2d2] bg-white px-5 py-6 shadow-[0_24px_80px_-52px_rgba(16,35,29,0.2)] sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-[#f4efe6] p-3 text-[#10392f]">
                      <LockKeyhole className="size-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#10231d]">Continue with your number</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#5f655f]">
                        Use the same mobile number you shared with your team.
                      </p>
                    </div>
                  </div>

                  <form className="mt-5 space-y-3" onSubmit={(e) => void handleUnlock(e)}>
                    <label className="block text-sm font-medium text-[#243a33]" htmlFor="watch-phone">
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
                      className="h-12 w-full rounded-2xl border border-[#d7d0c2] bg-[#fcfaf6] px-4 text-base text-[#10231d] outline-none transition focus:border-[#10392f] focus:ring-2 focus:ring-[#10392f]/10"
                    />
                    {unlockError ? (
                      <p className="text-sm text-red-700" role="alert">
                        {unlockError}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={unlocking}
                      className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#10392f] px-5 text-sm font-semibold text-white transition hover:bg-[#0c2f26] disabled:opacity-60"
                    >
                      {unlocking ? 'Verifying…' : 'Continue'}
                    </button>
                  </form>
                </section>
              ) : (
                <section className="overflow-hidden rounded-[2.1rem] border border-[#ece2d2] bg-white shadow-[0_28px_90px_-56px_rgba(16,35,29,0.26)]">
                  <div className="bg-[#0b1714] p-3 sm:p-4">
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

                        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 text-white/90">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-white">{playerStatusTitle}</p>
                              <p className="mt-1 text-sm leading-relaxed text-white/65">{playerStatusBody}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void togglePlayback()}
                              disabled={!videoSrc || completing}
                              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-[#10231d] transition hover:bg-[#f0e7da] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {playerButtonLabel}
                            </button>
                          </div>

                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-[#d7c8af] transition-[width]"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                            <span>{progressLabel}</span>
                            <span>{watchCompleted ? 'Thanks for watching.' : 'Please watch through to the end.'}</span>
                          </div>

                          {completing ? <p className="mt-3 text-xs text-[#d7c8af]">Finishing up…</p> : null}
                          {playerError ? (
                            <p className="mt-3 text-xs text-red-300" role="alert">
                              {playerError}
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
