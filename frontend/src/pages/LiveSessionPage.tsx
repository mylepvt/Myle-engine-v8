import { Fragment, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Copy } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { buildLiveSessionMessage, extractPasscode, formatLiveSessionUpdatedAt } from '@/lib/live-session-message'

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

const URL_OR_BOLD = /(https?:\/\/\S+|\*[^*\n]+\*)/g

/** Render one WhatsApp line: `*bold*` as bold, URLs as links — so the page shows exactly what gets copied. */
function renderWhatsAppLine(line: string): ReactNode[] {
  return line.split(URL_OR_BOLD).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline-offset-2 hover:underline">
          {part}
        </a>
      )
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(1, -1)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

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
  // The admin's "Passcode" setting (older saves held "⏰ 2:00 PM · ID … · Passcode 303948").
  const passcode = extractPasscode(liveCard?.detail)
  const message = joinHref ? buildLiveSessionMessage(joinHref, passcode) : ''

  async function copyMessage() {
    if (!message) return
    const text = message
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
        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-4">
          <p className="text-ds-label font-bold uppercase tracking-wider text-destructive-ink">
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-destructive align-middle" aria-hidden />
            Today&apos;s Live Session
          </p>
          {/* the exact WhatsApp message members copy — same text, bold + links rendered */}
          <div className="mt-3 select-text whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-card-foreground">
            {message.split('\n').map((line, i) => (
              <Fragment key={i}>
                {renderWhatsAppLine(line)}
                {'\n'}
              </Fragment>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={joinHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-5 text-sm font-semibold text-white transition hover:bg-destructive"
            >
              Join Now <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-destructive/40 bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-destructive/10"
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 size-4 text-success-ink" aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 size-4" aria-hidden /> Copy message
                </>
              )}
            </button>
          </div>
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
