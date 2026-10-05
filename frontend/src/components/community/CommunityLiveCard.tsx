import { useEffect, useState } from 'react'
import { ClipboardCheck, PartyPopper, PhoneCall, RefreshCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type CommunityFeedKind,
  type CommunityLive,
  useCommunityLiveQuery,
} from '@/hooks/use-community-live-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

const KIND_ICON: Record<CommunityFeedKind, { icon: LucideIcon; tone: string }> = {
  call: { icon: PhoneCall, tone: 'bg-success/15 text-success-ink' },
  followup: { icon: RefreshCcw, tone: 'bg-primary/15 text-primary' },
  report: { icon: ClipboardCheck, tone: 'bg-muted text-muted-foreground' },
  win: { icon: PartyPopper, tone: 'bg-warning/15 text-warning-ink' },
}

function onlineLine(live: CommunityLive): string {
  const n = live.online_now
  if (n === 0) return 'No one else is on MYLE right now — be the first today.'
  const names = live.online_names.slice(0, 2)
  const others = n - names.length
  const who = others > 0 ? `${names.join(', ')} and ${others} more` : names.join(' and ')
  return `${who} ${n === 1 ? 'is' : 'are'} working right now`
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-2 text-center">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-ds-micro text-muted-foreground">{label}</p>
    </div>
  )
}

/** Live pulse of the whole community: who is on the app, today's totals, recent actions. */
export function CommunityLiveCard() {
  const { data, isPending, isError } = useCommunityLiveQuery()
  // Re-render every 30 s so "2m ago" stays honest between fetches.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (isError) return null

  return (
    <Card className="border-success/25">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <span>Live on MYLE</span>
          {data ? (
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
            <p className="text-sm text-muted-foreground">{onlineLine(data)}</p>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={data.today.calls} label="Calls today" />
              <Stat value={data.today.followups} label="Follow-ups" />
              <Stat value={data.today.members_worked} label="Members working" />
            </div>
            {data.feed.length ? (
              <ul className="space-y-0.5" aria-live="polite">
                {data.feed.slice(0, 8).map((item) => {
                  const { icon: Icon, tone } = KIND_ICON[item.kind] ?? KIND_ICON.call
                  return (
                    <li key={`${item.kind}-${item.user_id}-${item.at}`} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', tone)}>
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.text}</p>
                      <span className="shrink-0 text-ds-caption text-muted-foreground">
                        {formatRelativeTimeShort(item.at, now)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-ds-caption text-muted-foreground">
                No activity yet today. Make the first call and lead the way.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
