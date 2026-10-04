import { Flame, HandHeart, PartyPopper, Sparkles, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type TeamWin, type WinKind, useCheerWinMutation, useWinsQuery } from '@/hooks/use-wins-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

const KIND_ICON: Record<WinKind, { icon: LucideIcon; tone: string }> = {
  enrollment: { icon: PartyPopper, tone: 'bg-success/15 text-success-ink' },
  conversion: { icon: TrendingUp, tone: 'bg-primary/15 text-primary' },
  level_up: { icon: Sparkles, tone: 'bg-warning/15 text-warning-ink' },
  streak: { icon: Flame, tone: 'bg-destructive/15 text-destructive-ink' },
}

function WinRow({ win }: { win: TeamWin }) {
  const cheer = useCheerWinMutation()
  const { icon: Icon, tone } = KIND_ICON[win.kind] ?? KIND_ICON.enrollment
  return (
    <li className="flex items-center gap-3 rounded-md px-1 py-1.5">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {win.is_mine ? win.text.replace(win.name, 'You').replace(' is on', ' are on') : win.text}
        </p>
        <p className="text-ds-caption text-muted-foreground">{formatRelativeTimeShort(win.created_at)}</p>
      </div>
      <button
        type="button"
        onClick={() => cheer.mutate(win.id)}
        aria-pressed={win.cheered_by_me}
        aria-label={win.cheered_by_me ? 'Remove cheer' : 'Cheer this win'}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-ds-caption font-semibold transition-all active:scale-90',
          win.cheered_by_me
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <HandHeart className={cn('size-3.5', win.cheered_by_me && 'fill-current')} aria-hidden />
        {win.cheers > 0 ? <span className="tabular-nums">{win.cheers}</span> : <span>Cheer</span>}
      </button>
    </li>
  )
}

/** Live team wins: enrollments, conversions, level-ups and streaks — tap to cheer. */
export function WinsFeedCard() {
  const { data, isPending, isError } = useWinsQuery()
  const items = data?.items.slice(0, 8) ?? []
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <PartyPopper className="size-4 text-primary" aria-hidden />
          Team wins
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Team wins are unavailable right now.</p>
        ) : !items.length ? (
          <p className="text-ds-caption text-muted-foreground">
            No wins yet today. Enroll a prospect or hit your call target to be the first.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((w) => <WinRow key={w.id} win={w} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
