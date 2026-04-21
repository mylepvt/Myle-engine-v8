import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'
import { WatchLiveGauge } from '@/components/watch/WatchLiveGauge'
import { apiUrl } from '@/lib/api'
import { buildEmbeddableVideoUrl, resolveYouTubeWatchUrl } from '@/lib/youtube'

type WatchPageData = {
  token: string
  title: string
  youtube_url: string | null
  lead_name: string
  view_count: number
}

export function WatchPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<WatchPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('Invalid link.')
      setLoading(false)
      return
    }

    fetch(apiUrl(`/api/v1/watch/${token}`))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const detail =
            typeof body === 'object' && body !== null && 'detail' in body
              ? String((body as { detail?: string }).detail)
              : `HTTP ${res.status}`
          throw new Error(detail)
        }
        return res.json() as Promise<WatchPageData>
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load video.')
        setLoading(false)
      })
  }, [token])

  const embedUrl = useMemo(
    () => buildEmbeddableVideoUrl(data?.youtube_url, null),
    [data?.youtube_url],
  )
  const externalUrl = useMemo(
    () => resolveYouTubeWatchUrl(data?.youtube_url, null) ?? data?.youtube_url ?? null,
    [data?.youtube_url],
  )

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#040915] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[4rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/16 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(8,15,30,0.72),rgba(3,6,13,0.96))]" />
      </div>

      <header className="relative w-full border-b border-white/10 bg-black/20 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Myle Experience</p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-white">Private Watch Room</p>
          </div>
          <Badge variant="outline" className="border-white/15 bg-white/[0.05] text-white/72">
            Same-domain video room
          </Badge>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        {loading ? (
          <>
            <Skeleton className="h-12 w-72 bg-white/10" />
            <Skeleton className="h-[30rem] w-full rounded-[2rem] bg-white/10" />
            <Skeleton className="h-32 w-full rounded-[2rem] bg-white/10" />
          </>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-red-400/20 bg-red-500/[0.08] px-6 py-8 text-center" role="alert">
            <p className="text-sm text-red-200">{error}</p>
            <p className="mt-2 text-xs text-white/55">
              This link may have expired or is invalid.
            </p>
          </div>
        ) : data ? (
          <>
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_80px_-38px_rgba(34,211,238,0.55)] backdrop-blur-xl md:p-7">
              <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
                <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
                  <WatchLiveGauge />
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">
                      <Sparkles className="mr-1 size-3.5" />
                      Private share
                    </Badge>
                    <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-white/75">
                      View #{data.view_count}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Personal video room</p>
                    <h1 className="mt-2 text-3xl font-semibold leading-tight text-white md:text-[2.6rem]">
                      {data.title}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 md:text-base">
                      Hey {data.lead_name}, this video was shared personally for you. Watch it here
                      inside Myle with the full branded experience.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Playback</p>
                      <p className="mt-2 text-sm font-semibold text-white">Inside Myle</p>
                    </div>
                    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Trust Layer</p>
                      <p className="mt-2 text-sm font-semibold text-white">Private same-domain room</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {embedUrl ? (
              <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">In-app player</p>
                    <p className="mt-1 text-sm text-white/60">
                      Video plays here so the experience stays premium and focused.
                    </p>
                  </div>
                  <Badge variant="success">Ready</Badge>
                </div>
                <InAppVideoPlayer
                  embedUrl={embedUrl}
                  title={data.title}
                  fallbackUrl={externalUrl}
                  previewEyebrow="Private room ready"
                  previewTitle={data.title}
                  previewDescription="Tap play to open the session inside Myle without exposing external player clutter before the video starts."
                />
              </section>
            ) : (
              <InAppVideoPlayer
                embedUrl={null}
                title={data.title}
                fallbackUrl={externalUrl}
                previewEyebrow="Private room ready"
                previewTitle={data.title}
              />
            )}

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-200">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Built for trust</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/58">
                      Same-domain playback makes the journey feel premium instead of bouncing out to a raw YouTube page.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-emerald-200">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">What happens next</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/58">
                      After watching, the team can follow up with you directly from the next step in the flow.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
