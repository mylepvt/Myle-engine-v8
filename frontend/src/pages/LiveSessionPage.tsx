import { useQuery } from '@tanstack/react-query'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'

type LiveSessionStub = {
  items: { title: string; detail?: string | null; external_href?: string | null }[]
}

async function fetchLiveSession(): Promise<LiveSessionStub> {
  const res = await apiFetch('/api/v1/other/live-session')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<LiveSessionStub>
}

type Props = { title: string }

/** Admin's daily live (Zoom) session — the `live_session_*` app settings. */
export function LiveSessionPage({ title }: Props) {
  const liveSession = useQuery({
    queryKey: ['other', 'live-session'],
    queryFn: fetchLiveSession,
    refetchInterval: 60_000,
  })
  const liveCard = liveSession.data?.items?.[0]
  const joinHref = liveCard?.external_href?.trim() || null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-ds-h1">{title}</h1>

      {liveSession.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {liveSession.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load the live session.
        </p>
      ) : null}

      {joinHref ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
          <p className="text-ds-label font-bold uppercase tracking-wider text-red-500 dark:text-red-300">
            🔴 Today&apos;s Live Session
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {liveCard?.title || "Today's Live Session"}
          </p>
          {liveCard?.detail ? (
            <p className="mt-1 whitespace-pre-line text-ds-caption text-muted-foreground">{liveCard.detail}</p>
          ) : null}
          <a
            href={joinHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            👉 Join Now
          </a>
        </div>
      ) : liveSession.data ? (
        <p className="text-sm text-muted-foreground">No live session link has been published yet.</p>
      ) : null}
    </div>
  )
}
