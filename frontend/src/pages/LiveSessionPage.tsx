import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { isSafeHttpUrl } from '@/lib/safe-http-url'
import { apiFetch } from '@/lib/api'

type ScheduleSlot = {
  hour: number
  label: string
  state: 'past' | 'upcoming' | 'waiting' | 'live'
  live_starts_at: string
  live_ends_at: string
  viewer_count_today: number
}

type ScheduleResponse = {
  slots: ScheduleSlot[]
  premiere_link: string
  active_hour: number | null
}

async function fetchSchedule(): Promise<ScheduleResponse> {
  const res = await apiFetch('/api/v1/other/premiere/schedule')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ScheduleResponse>
}

function PremiereSchedulePanel() {
  const { data, isPending } = useQuery({
    queryKey: ['premiere', 'schedule'],
    queryFn: fetchSchedule,
    refetchInterval: 30_000,
  })

  const link = `${window.location.origin}/premiere`
  const [copied, setCopied] = useState(false)

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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily Premiere Schedule</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">11 sessions daily — same link for all</h3>
        </div>
        {data?.active_hour != null && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
            </span>
            Live now
          </span>
        )}
      </div>

      {/* Permanent link */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-all text-sm font-medium text-[#c9d9ff]">{link}</p>
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy} className="shrink-0">
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>

      {/* Schedule table */}
      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : data ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Time</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Ends</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Viewers</th>
              </tr>
            </thead>
            <tbody>
              {data.slots.map((slot) => (
                <tr
                  key={slot.hour}
                  className={`border-b border-white/[0.06] last:border-0 ${slot.state === 'live' ? 'bg-red-500/[0.06]' : slot.state === 'waiting' ? 'bg-indigo-500/[0.06]' : ''}`}
                >
                  <td className="px-3 py-2 font-medium text-foreground">{slot.label}</td>
                  <td className="px-3 py-2">
                    {slot.state === 'live' ? (
                      <span className="flex items-center gap-1 text-red-400 font-semibold">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                        </span>
                        Live
                      </span>
                    ) : slot.state === 'waiting' ? (
                      <span className="text-indigo-400 font-semibold">Waiting</span>
                    ) : slot.state === 'past' ? (
                      <span className="text-muted-foreground">Done</span>
                    ) : (
                      <span className="text-muted-foreground">Upcoming</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(slot.live_ends_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'Asia/Kolkata', hour12: true,
                    })}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {slot.viewer_count_today > 0 ? slot.viewer_count_today : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Prospect sees only current/next session — schedule is hidden from them. Configure via <code className="rounded bg-white/10 px-1">premiere_session_hours</code> in Settings.
      </p>
    </div>
  )
}

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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private live session link</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Share with prospects — exclusive session goes live at 6 PM</h3>
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
      <PremiereSchedulePanel />
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
