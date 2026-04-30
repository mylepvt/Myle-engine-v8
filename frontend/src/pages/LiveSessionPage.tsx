import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { isSafeHttpUrl } from '@/lib/safe-http-url'

function PremiereSharePanel() {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/premiere`

  function handleCopy() {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="surface-elevated space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily premiere link</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Prospects ke saath share karo — daily 6 PM par video live hoti hai</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
          </span>
          Live daily
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all text-sm font-medium text-[#c9d9ff]">{link}</p>
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy} className="shrink-0">
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>• 5:50 PM — Waiting room opens (countdown + music)</li>
        <li>• 6:00 PM — Video auto-starts</li>
        <li>• 6:49 PM — Session ends</li>
        <li>• Same link works daily. Admin sets video once in Settings → <code className="rounded bg-white/10 px-1">premiere_video_url</code></li>
      </ul>
    </div>
  )
}

type Props = { title: string }

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) {
    throw new Error('Copy failed')
  }
}

export function LiveSessionPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/other/live-session')
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')

  const first = data?.items[0]
  const rawHref = first && typeof first.external_href === 'string' ? first.external_href.trim() : ''
  const href = isSafeHttpUrl(rawHref) ? rawHref : ''
  const sessionTitle = first && typeof first.title === 'string' ? first.title : 'Live session'
  const detail = first && typeof first.detail === 'string' ? first.detail : ''

  const handleCopy = async () => {
    if (!rawHref) return
    try {
      await copyToClipboard(rawHref)
      setCopyState('done')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <PremiereSharePanel />
      <div className="surface-elevated space-y-2 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/90">Where to configure session links (admin)</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Settings → General</strong> (table): keys{' '}
            <code className="rounded bg-white/10 px-1">live_session_url</code>,{' '}
            <code className="rounded bg-white/10 px-1">live_session_title</code>,{' '}
            <code className="rounded bg-white/10 px-1">live_session_schedule</code>
          </li>
          <li>
            Legacy import keys: <code className="rounded bg-white/10 px-1">zoom_link</code>,{' '}
            <code className="rounded bg-white/10 px-1">zoom_title</code>,{' '}
            <code className="rounded bg-white/10 px-1">zoom_time</code>,{' '}
            <code className="rounded bg-white/10 px-1">paper_plan_link</code> (also read by the API).
          </li>
        </ul>
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="surface-elevated space-y-5 p-6">
          {data.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}
          <div>
            <h2 className="text-lg font-semibold text-foreground">{sessionTitle}</h2>
            {detail ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{detail}</p> : null}
          </div>
          {rawHref && !href ? (
            <p className="text-sm text-destructive" role="alert">
              Meeting link is set but is not a valid http(s) URL. Update{' '}
              <code className="rounded bg-white/10 px-1 text-xs">live_session_url</code> in app settings.
            </p>
          ) : null}
          {href ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    Join live session
                  </a>
                </Button>
                <Button type="button" variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => void handleCopy()}>
                  {copyState === 'done' ? 'Link copied' : 'Copy link'}
                </Button>
              </div>
              <p className="break-all text-xs text-muted-foreground">{rawHref}</p>
              {copyState === 'error' ? (
                <p className="text-xs text-destructive" role="alert">
                  Could not copy automatically. You can still copy the link shown above.
                </p>
              ) : null}
            </div>
          ) : !rawHref ? (
            <p className="text-sm text-amber-300/90">
              Meeting link not published yet. Ask an admin to set{' '}
              <code className="rounded bg-white/10 px-1 text-xs">live_session_url</code> in app settings
              (Settings → General).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
