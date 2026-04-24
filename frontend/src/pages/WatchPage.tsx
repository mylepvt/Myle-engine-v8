import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LockKeyhole, ShieldCheck, TimerReset } from 'lucide-react'

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
}

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
  const [data, setData] = useState<WatchPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [playMarked, setPlayMarked] = useState(false)
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
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load secure room.')
        setLoading(false)
      })
  }, [token])

  const wish = useMemo(() => resolveWish(new Date(nowMs)), [nowMs])
  const countdown = useMemo(
    () => (data ? formatRemaining(data.expires_at, nowMs) : ''),
    [data, nowMs],
  )

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
      setPhone('')
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Could not verify number.')
    } finally {
      setUnlocking(false)
    }
  }

  async function handleFirstPlay() {
    if (!token || !data?.access_granted || playMarked) return
    setPlayMarked(true)
    try {
      const res = await fetch(apiUrl(`/api/v1/watch/${token}/play`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        throw await readJsonError(res, 'Could not start secure playback.')
      }
      setData((current) => (current ? { ...current, watch_started: true } : current))
    } catch {
      setPlayMarked(false)
    }
  }

  const videoSrc = data?.stream_url ? apiUrl(data.stream_url) : null

  return (
    <div className="min-h-screen bg-[#f4efe6] text-[#10231d]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        <header className="rounded-[2rem] border border-black/5 bg-white/80 px-5 py-4 shadow-[0_24px_80px_-48px_rgba(16,35,29,0.32)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#4f6a61]">Myle Experience</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#10231d]">Private Enrollment Room</h1>
            </div>
            {data ? (
              <Badge variant="outline" className="border-[#d7c8af] bg-[#fff8ee] text-[#7a5d32]">
                {countdown}
              </Badge>
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
                Agar yeh link abhi mila hai to sender se naya secure link share karne ko bolen.
              </p>
            </section>
          ) : data ? (
            <>
              <section className="rounded-[2rem] border border-black/5 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(16,35,29,0.35)] sm:px-7 sm:py-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-sm font-medium text-[#5a6c64]">
                      {wish}, <span className="font-semibold text-[#10231d]">{data.lead_name}</span>
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-[#10231d]">
                      {data.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-[#5f655f] sm:text-base">
                      Yeh room sirf aapke liye banaya gaya hai. Video Myle ke andar hi play hogi, aur access sirf
                      aapke registered number ke saath milega.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-0 bg-[#10392f] text-white">
                      <ShieldCheck className="mr-1 size-3.5" />
                      Trusted in-app playback
                    </Badge>
                    <Badge variant="outline" className="border-[#d7c8af] bg-[#fff8ee] text-[#7a5d32]">
                      {data.masked_phone}
                    </Badge>
                  </div>
                </div>
              </section>

              {!data.access_granted ? (
                <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-black/5 bg-white px-5 py-6 shadow-[0_24px_80px_-52px_rgba(16,35,29,0.28)] sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-[#f4efe6] p-3 text-[#10392f]">
                      <LockKeyhole className="size-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#10231d]">Unlock with your registered number</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#5f655f]">
                        Jo number lead card par registered hai, wahi yahan enter karein. Tabhi secure room open hogi.
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
                      {unlocking ? 'Verifying…' : 'Unlock private room'}
                    </button>
                  </form>
                </section>
              ) : (
                <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_24px_80px_-52px_rgba(16,35,29,0.35)]">
                  <div className="border-b border-black/5 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#10231d]">Private in-app player</p>
                        <p className="mt-1 text-sm text-[#5f655f]">
                          Playback stays inside Myle. No YouTube redirect, no related videos.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-[#d8e3db] bg-[#f7fbf8] text-[#285241]">
                          <ShieldCheck className="mr-1 size-3.5" />
                          Same-domain stream
                        </Badge>
                        {data.watch_started ? (
                          <Badge variant="outline" className="border-[#d8e3db] bg-[#f7fbf8] text-[#285241]">
                            Started
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0b1714] p-3 sm:p-4">
                    {videoSrc ? (
                      <video
                        className="aspect-video h-full w-full rounded-[1.4rem] bg-black object-contain"
                        src={videoSrc}
                        crossOrigin="use-credentials"
                        controls
                        playsInline
                        preload="metadata"
                        controlsList="nodownload noplaybackrate noremoteplayback"
                        disablePictureInPicture
                        onPlay={() => void handleFirstPlay()}
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-[1.4rem] bg-black text-sm text-white/70">
                        Secure video stream is getting ready.
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.6rem] border border-black/5 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#f4efe6] p-3 text-[#7a5d32]">
                      <TimerReset className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#10231d]">Time-limited access</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#5f655f]">
                        Security ke liye yeh room 30 minutes me expire ho jaati hai.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.6rem] border border-black/5 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#f4efe6] p-3 text-[#10392f]">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#10231d]">High-trust room</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#5f655f]">
                        Yeh same Myle experience hai, isliye external player clutter ya suggested content nahi dikhega.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}
