import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'
import { apiUrl } from '@/lib/api'
import { buildBatchGreetingCopy } from '@/lib/batch-watch'
import { buildEmbeddableVideoUrl, resolveYouTubeWatchUrl } from '@/lib/youtube'

type BatchWatchData = {
  token: string
  slot: string
  version: number
  day_number: number
  slot_label: string
  title: string
  subtitle: string
  lead_name: string
  access_open: boolean
  opens_at: string | null
  gate_message: string | null
  youtube_url: string | null
  video_id: string | null
  watch_complete: boolean
  day2_evaluation_ready: boolean
}

function toAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  return apiUrl(url)
}

async function readJsonError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail
  }
  return res.statusText || `HTTP ${res.status}`
}

function formatGateTime(value: string | null): string {
  if (!value) return 'your scheduled batch time'
  return new Date(value).toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

export function BatchWatchPage() {
  const { slot, version } = useParams<{ slot: string; version: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [data, setData] = useState<BatchWatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completionBusy, setCompletionBusy] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)

  const isDay6 = slot?.startsWith('d6_') ?? false
  const [nowMs, setNowMs] = useState(() => Date.now())

  const loadPayload = async () => {
    if (!slot || !version || !token) return
    const res = await fetch(apiUrl(`/api/v1/watch/batch/${slot}/${version}/payload?token=${encodeURIComponent(token)}`))
    if (!res.ok) throw new Error(await readJsonError(res))
    const payload = (await res.json()) as BatchWatchData
    setData(payload)
  }

  useEffect(() => {
    if (!slot || !version || !token) {
      setError('This batch link is incomplete. Please use the latest link.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    void loadPayload()
      .then(() => {
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not open this batch page.')
        setLoading(false)
      })
  }, [slot, token, version])

  // Heartbeat every 20s so admin sees live batch viewers
  useEffect(() => {
    if (!slot || !token) return
    const beat = () => {
      void fetch(apiUrl('/api/v1/watch/batch/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot }),
      }).catch(() => undefined)
    }
    beat()
    const id = setInterval(beat, 20_000)
    return () => clearInterval(id)
  }, [slot, token])

  // 1-second ticker for waiting room countdown
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const playerEmbedUrl = useMemo(
    () => buildEmbeddableVideoUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id),
    [data?.video_id, data?.youtube_url],
  )
  const playerExternalUrl = useMemo(
    () => resolveYouTubeWatchUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id) ?? toAbsoluteUrl(data?.youtube_url),
    [data?.video_id, data?.youtube_url],
  )

  const watchComplete = !!data?.watch_complete
  const accessOpen = data?.access_open !== false

  const opensAtMs = data?.opens_at ? new Date(data.opens_at).getTime() : null
  const msUntilOpen = opensAtMs != null ? Math.max(0, opensAtMs - nowMs) : null
  const startingSoon = msUntilOpen != null && msUntilOpen <= 15 * 60 * 1000
  const countdownLabel = (() => {
    if (msUntilOpen == null || msUntilOpen <= 0) return null
    const totalSec = Math.ceil(msUntilOpen / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  const handleMarkComplete = async () => {
    if (!slot || !token || completionBusy) return
    setCompletionBusy(true)
    setCompletionError(null)
    try {
      const res = await fetch(apiUrl('/api/v1/watch/batch/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot }),
      })
      if (!res.ok) throw new Error(await readJsonError(res))
      await loadPayload()
    } catch (err) {
      setCompletionError(err instanceof Error ? err.message : 'Could not update watch status.')
    } finally {
      setCompletionBusy(false)
    }
  }

  const greetingCopy = data
    ? buildBatchGreetingCopy({
        leadName: data.lead_name,
        dayNumber: data.day_number,
        slot: data.slot,
        slotLabel: data.slot_label,
      })
    : null

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-room-base text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[4rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/16 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(8,15,30,0.72),rgba(3,6,13,0.96))]" />
      </div>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-56 bg-white/10" />
            <Skeleton className="aspect-video w-full rounded-2xl bg-white/10" />
            <Skeleton className="h-10 w-full rounded-2xl bg-white/10" />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-red-400/20 bg-red-500/[0.08] px-6 py-8 text-center">
            <p className="text-base font-semibold text-white">This batch room could not be opened.</p>
            <p className="mt-2 text-sm text-white/70">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Title — short, video stays the hero */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Day {data.day_number}</Badge>
              <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                {data.slot_label}
              </Badge>
              {!isDay6 && (
                <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                  Video {data.version}
                </Badge>
              )}
              {watchComplete ? <Badge variant="success">Watch tracked</Badge> : <Badge variant="warning">Playing now</Badge>}
            </div>
            <h1 className="text-xl font-semibold leading-tight text-white sm:text-2xl">
              {greetingCopy?.heroTitle ?? `${data.slot_label} batch ready for ${data.lead_name}.`}
            </h1>

            {/* Video first — old-app style, shown immediately */}
            {accessOpen ? (
              <InAppVideoPlayer
                embedUrl={playerEmbedUrl}
                title={data.title}
                fallbackUrl={playerExternalUrl}
                previewEyebrow={`Day ${data.day_number} · ${data.slot_label}`}
                previewTitle={data.title}
                previewDescription="Tap play to watch this video inside Myle."
                playLabel="Play video"
                seekPrevention
              />
            ) : (
              <div className={`rounded-2xl border px-5 py-6 text-left transition-colors ${startingSoon ? 'border-emerald-400/30 bg-emerald-400/[0.07]' : 'border-amber-300/20 bg-amber-400/[0.08]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm font-semibold uppercase tracking-[0.24em] ${startingSoon ? 'text-emerald-300/80' : 'text-amber-200/80'}`}>
                    {startingSoon ? 'Starting soon' : 'Scheduled access'}
                  </p>
                  {countdownLabel && (
                    <p className={`font-mono text-3xl font-bold tabular-nums ${startingSoon ? 'text-emerald-300' : 'text-white'}`}>
                      {countdownLabel}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {startingSoon ? 'Session is about to begin!' : 'This room is locked for now'}
                </p>
                <p className="mt-3 text-ds-body text-white/72">
                  {startingSoon
                    ? 'Stay on this page — the video will unlock automatically when the session starts.'
                    : (data.gate_message ?? 'Please open this room only at your scheduled batch time.')}
                </p>
                {!startingSoon && (
                  <p className="mt-3 text-sm text-amber-100">
                    Opens at {formatGateTime(data.opens_at)}
                  </p>
                )}
              </div>
            )}

            {/* Confirm watched */}
            {accessOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/55">If the video doesn't start, tap play on the screen.</p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={completionBusy || watchComplete}
                  onClick={() => void handleMarkComplete()}
                >
                  {watchComplete ? 'Watch tracked' : completionBusy ? 'Saving...' : 'I watched this'}
                </Button>
              </div>
            ) : null}

            {completionError ? (
              <p className="text-sm text-red-300">{completionError}</p>
            ) : watchComplete ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                {/* emoji-ok: the prospect literally replies with this emoji */}
                <p>{greetingCopy?.completionMessage ?? 'Batch watched. Reply ✅ to your coach to confirm.'}</p>
              </div>
            ) : accessOpen ? (
              <p className="text-center text-sm text-white/60">
                {/* emoji-ok: the prospect literally replies with this emoji */}
                Finished watching? Message your coach and reply ✅ to confirm.
              </p>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  )
}
