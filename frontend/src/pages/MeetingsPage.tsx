import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink, Megaphone, Pin, Video } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { resolveItemLabel } from '@/config/dashboard-registry'
import { hubSections } from '@/config/dashboard-tabs'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useNoticeBoardQuery } from '@/hooks/use-notice-board-query'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type LiveSessionStub = {
  items: { title: string; detail?: string | null; external_href?: string | null }[]
}

// Same key and endpoint as LiveSessionPage, so the two share one cache entry.
async function fetchLiveSession(): Promise<LiveSessionStub> {
  const res = await apiFetch('/api/v1/other/live-session')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<LiveSessionStub>
}

const DAY_MS = 86_400_000
const IST_OFFSET_MS = 330 * 60_000
const rowClass = 'jw-row press flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left'

/** Monday 00:00 IST of the week `offset` weeks from this one, as a UTC timestamp. */
function weekStart(offset: number): number {
  const ist = new Date(Date.now() + IST_OFFSET_MS)
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday)
  return mondayIst - IST_OFFSET_MS + offset * 7 * DAY_MS
}

function shortDate(ms: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(ms).toLocaleDateString('en-IN', { ...opts, timeZone: 'Asia/Kolkata' })
}

function weekLabel(offset: number): string {
  const start = weekStart(offset)
  const range = `${shortDate(start)} – ${shortDate(start + 6 * DAY_MS)}`
  if (offset === 0) return `${range} · This Week`
  if (offset === -1) return `${range} · Last Week`
  return range
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-ds-h2 font-bold text-foreground">{title}</h2>
      <ul className="grid grid-cols-1 gap-[3px] lg:grid-cols-2">{children}</ul>
    </section>
  )
}

function Row({ icon, title, meta, trailing }: { icon: ReactNode; title: ReactNode; meta?: string; trailing?: ReactNode }) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center text-foreground/85">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ds-body text-foreground">{title}</span>
        {meta ? <span className="block truncate text-ds-caption text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing ?? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
}

/** Meetings tab: a week at a time — today's live session, that week's notices, then the meeting screens. */
export function MeetingsPage() {
  const { role } = useDashboardShellRole()
  const [offset, setOffset] = useState(0)
  const live = useQuery({ queryKey: ['other', 'live-session'], queryFn: fetchLiveSession, refetchInterval: 60_000 })
  const notices = useNoticeBoardQuery()

  const start = weekStart(offset)
  const end = start + 7 * DAY_MS
  const weekNotices = (notices.data?.items ?? [])
    .filter((n) => {
      const t = Date.parse(n.created_at)
      return t >= start && t < end
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const session = live.data?.items?.[0]
  const joinHref = session?.external_href?.trim() || null
  const screens = role ? hubSections('meetings', role).flatMap((s) => s.items) : []

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <nav aria-label="Week" className="flex items-center justify-center gap-4">
        <button type="button" onClick={() => setOffset(offset - 1)} className="press flex size-10 items-center justify-center text-primary" aria-label="Previous week">
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-0 text-center text-ds-body font-medium text-primary" aria-live="polite">
          {weekLabel(offset)}
        </span>
        <button
          type="button"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= 0}
          className="press flex size-10 items-center justify-center text-primary disabled:opacity-30"
          aria-label="Next week"
        >
          <ChevronRight className="size-5" />
        </button>
      </nav>

      {offset === 0 ? (
        <Section title="Live Session">
          <li>
            {live.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : joinHref ? (
              <div className="jw-row flex items-center">
                <Link to="/dashboard/other/live-session" className={cn(rowClass, 'flex-1 bg-transparent')}>
                  <Row icon={<Video className="size-7" strokeWidth={1.25} />} title={session!.title} meta={session!.detail ?? undefined} trailing={<span />} />
                </Link>
                <a
                  href={joinHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary press mr-4 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm"
                >
                  Join <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            ) : (
              <Link to="/dashboard/other/live-session" className={rowClass}>
                <Row icon={<Video className="size-7" strokeWidth={1.25} />} title="No live session link yet" meta="The link appears here once it's posted" />
              </Link>
            )}
          </li>
        </Section>
      ) : null}

      <Section title="Notices">
        {notices.isPending ? (
          <li>
            <Skeleton className="h-16 w-full" />
          </li>
        ) : weekNotices.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground lg:col-span-2">No notices this week.</li>
        ) : (
          weekNotices.map((n) => (
            <li key={n.id}>
              <Link to="/dashboard/other/notice-board" className={rowClass}>
                <Row
                  icon={<Megaphone className="size-7" strokeWidth={1.25} />}
                  title={n.message || 'Voice note'}
                  meta={`${shortDate(Date.parse(n.created_at), { weekday: 'short', day: 'numeric', month: 'short' })} · ${n.created_by}`}
                  trailing={n.pin ? <Pin className="size-4 shrink-0 text-primary" aria-label="Pinned" /> : undefined}
                />
              </Link>
            </li>
          ))
        )}
      </Section>

      {screens.length > 0 ? (
        <Section title="Meeting Tools">
          {screens.map((item) => {
            const Icon = getDashboardNavIcon(item.path)
            return (
              <li key={item.path}>
                <Link to={`/dashboard/${item.path}`} className={rowClass}>
                  <Row icon={<Icon className="size-7" strokeWidth={1.25} />} title={resolveItemLabel(item, role!)} />
                </Link>
              </li>
            )
          })}
        </Section>
      ) : null}
    </div>
  )
}
