import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { WatchLiveGauge } from '@/components/watch/WatchLiveGauge'

type WatchPageData = {
  token: string
  title: string
  youtube_url: string | null
  lead_name: string
  view_count: number
}

/** Extract YouTube video ID from various URL formats. */
function extractYouTubeId(url: string): string | null {
  try {
    // youtu.be/ID
    const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
    if (shortMatch) return shortMatch[1]

    const parsed = new URL(url)

    // youtube.com/watch?v=ID
    const v = parsed.searchParams.get('v')
    if (v && v.length === 11) return v

    // youtube.com/embed/ID
    const embedMatch = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]

    // youtube.com/shorts/ID
    const shortsMatch = parsed.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  } catch {
    // not a valid URL — ignore
  }
  return null
}

export function WatchPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<WatchPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!token) {
      setError('Invalid link.')
      setLoading(false)
      return
    }

    // Plain fetch — no auth headers needed (public endpoint)
    fetch(`/api/v1/watch/${token}`)
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
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [token])

  const videoId = data?.youtube_url ? extractYouTubeId(data.youtube_url) : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white flex flex-col items-center">
      {/* Header */}
      <header className="w-full border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            Myle
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-white/50">
            Watch
          </span>
        </div>
      </header>

      <main className="w-full max-w-2xl flex flex-col items-center gap-6 px-4 py-8">
        {loading ? (
          <>
            <Skeleton className="h-7 w-64 bg-white/10" />
            <Skeleton className="w-full aspect-video bg-white/10" />
            <Skeleton className="h-4 w-80 bg-white/10" />
          </>
        ) : error ? (
          <div className="text-center space-y-2 pt-8" role="alert">
            <p className="text-destructive text-sm">{error}</p>
            <p className="text-white/50 text-xs">
              This link may have expired or is invalid.
            </p>
          </div>
        ) : data ? (
          <>
            <WatchLiveGauge />

            {/* Title */}
            <h1 className="text-lg font-semibold text-center text-white/90">
              {data.title}
            </h1>

            {/* Personalised greeting */}
            <p className="text-sm text-white/60 -mt-3">
              Hey {data.lead_name}, this video was shared with you personally.
            </p>

            {/* Video embed */}
            {videoId ? (
              <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                  title={data.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="w-full aspect-video rounded-lg bg-white/5 flex items-center justify-center">
                <p className="text-white/40 text-sm">Video link coming soon.</p>
              </div>
            )}

            {/* Footer message */}
            <p className="text-center text-sm text-white/50 max-w-sm">
              This video was shared with you personally. After watching, you'll be
              contacted shortly.
            </p>
          </>
        ) : null}
      </main>
    </div>
  )
}
