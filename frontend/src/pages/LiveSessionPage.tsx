import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { isSafeHttpUrl } from '@/lib/safe-http-url'

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
