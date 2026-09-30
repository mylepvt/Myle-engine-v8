import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Copy } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { buildLiveSessionMessage, formatLiveSessionUpdatedAt } from '@/lib/live-session-message'

type LiveSessionStub = {
  items: {
    title: string
    detail?: string | null
    external_href?: string | null
    updated_at?: string | null
  }[]
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
  const [copied, setCopied] = useState(false)

  const updatedLabel = formatLiveSessionUpdatedAt(liveCard?.updated_at)

  async function copyMessage() {
    if (!joinHref || !liveCard) return
    const text = buildLiveSessionMessage(liveCard, joinHref)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API blocked (older WebView / non-secure context) — fall back to a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

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
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-red-500 align-middle" aria-hidden />
            Today&apos;s Live Session
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {liveCard?.title || "Today's Live Session"}
          </p>
          {liveCard?.detail ? (
            <p className="mt-1 whitespace-pre-line text-ds-caption text-muted-foreground">{liveCard.detail}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={joinHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Join Now <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-500/40 bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-red-500/10"
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 size-4 text-emerald-500" aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 size-4" aria-hidden /> Copy message
                </>
              )}
            </button>
          </div>
          <p className="mt-2 break-all text-ds-caption text-muted-foreground">{joinHref}</p>
          {updatedLabel ? (
            <p className="mt-1 text-ds-caption text-muted-foreground">Link updated: {updatedLabel}</p>
          ) : null}
        </div>
      ) : liveSession.data ? (
        <p className="text-sm text-muted-foreground">No live session link has been published yet.</p>
      ) : null}
    </div>
  )
}
