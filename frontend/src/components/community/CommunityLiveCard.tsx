import { useEffect, useState } from 'react'
import {
  Award,
  ClipboardCheck,
  Flame,
  GraduationCap,
  PartyPopper,
  PhoneCall,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  Trophy,
  UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type CommunityFeedKind,
  useCommunityLiveQuery,
} from '@/hooks/use-community-live-query'
import { MIN_ONLINE_SHOWN, onlineLine, pickStats } from '@/lib/community-live'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

const KIND_ICON: Record<CommunityFeedKind, { icon: LucideIcon; tone: string }> = {
  call: { icon: PhoneCall, tone: 'bg-success/15 text-success-ink' },
  lead: { icon: UserPlus, tone: 'bg-primary/15 text-primary' },
  followup: { icon: RefreshCcw, tone: 'bg-primary/15 text-primary' },
  batch: { icon: PlayCircle, tone: 'bg-success/15 text-success-ink' },
  day2: { icon: ShieldCheck, tone: 'bg-success/15 text-success-ink' },
  training: { icon: GraduationCap, tone: 'bg-warning/15 text-warning-ink' },
  certificate: { icon: Award, tone: 'bg-warning/15 text-warning-ink' },
  report: { icon: ClipboardCheck, tone: 'bg-muted text-muted-foreground' },
  win: { icon: PartyPopper, tone: 'bg-warning/15 text-warning-ink' },
  star: { icon: Flame, tone: 'bg-destructive/15 text-destructive-ink' },
  jackpot: { icon: Trophy, tone: 'bg-warning/15 text-warning-ink' },
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-2 text-center">
      <p className="text-lg font-bold tabular-nums text-foreground">{value.toLocaleString('en-IN')}</p>
      <p className="text-ds-micro text-muted-foreground">{label}</p>
    </div>
  )
}

/** Live pulse of the whole community: who is on the app, totals, recent actions. */
export function CommunityLiveCard() {
  const { data, isPending, isError } = useCommunityLiveQuery()
  // Re-render every 30 s so "2m ago" stays honest between fetches.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (isError) return null
  if (data && !data.feed.length && pickStats(data).stats.length === 0 && data.online_now < MIN_ONLINE_SHOWN) {
    return null // nothing worth showing yet
  }

  const line = data ? onlineLine(data) : null
  const { period, stats } = data ? pickStats(data) : { period: '', stats: [] }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <span>Live on MYLE</span>
          {data && data.online_now >= MIN_ONLINE_SHOWN ? (
            <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-ds-caption font-semibold text-success-ink">
              {data.online_now} online
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-14 w-full" />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <>
            {line ? <p className="text-sm text-muted-foreground">{line}</p> : null}
            {stats.length ? (
              <div>
                <p className="mb-1.5 text-ds-micro font-semibold uppercase tracking-wider text-muted-foreground">
                  {period}
                </p>
                <div className={cn('grid gap-2', stats.length === 1 ? 'grid-cols-1' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                  {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} />)}
                </div>
              </div>
            ) : null}
            {data.call_stars.length ? (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-ds-caption font-semibold text-warning-ink">
                  <Flame className="size-3.5" aria-hidden />
                  {data.star_calls}+ calls today
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.call_stars.map((s) => (
                    <li
                      key={s.user_id}
                      className="rounded-full bg-background/80 px-2.5 py-0.5 text-ds-caption font-semibold text-foreground"
                    >
                      {s.name} <span className="tabular-nums text-muted-foreground">{s.calls}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.feed.length ? (
              <ul className="space-y-0.5" aria-live="polite">
                {data.feed.slice(0, 8).map((item) => {
                  const { icon: Icon, tone } = KIND_ICON[item.kind] ?? KIND_ICON.call
                  return (
                    <li key={`${item.kind}-${item.user_id}-${item.at}`} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', tone)}>
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-foreground">{item.text}</p>
                      <span className="shrink-0 text-ds-caption text-muted-foreground">
                        {formatRelativeTimeShort(item.at, now)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
