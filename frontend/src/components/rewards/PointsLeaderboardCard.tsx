import { useState } from 'react'
import { Trophy } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { type MpPeriod, useMpLeaderboardQuery } from '@/hooks/use-rewards-query'
import { cn } from '@/lib/utils'

const PERIOD_LABELS: Record<MpPeriod, string> = { today: 'Today', week: 'Week', month: 'Month' }
const MEDAL_COLORS = ['text-warning-ink', 'text-foreground', 'text-warning-ink/70']

/**
 * MYLE Points race that resets daily / weekly / monthly, so everyone has a fresh shot.
 */
export function PointsLeaderboardCard() {
  const [period, setPeriod] = useState<MpPeriod>('today')
  const { data: me } = useAuthMeQuery()
  const { data, isPending, isError } = useMpLeaderboardQuery(period)
  const myId = me?.authenticated ? (me.user_id ?? undefined) : undefined
  const meOutsideTop = data?.me && !data.items.some((r) => r.user_id === data.me?.user_id)

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Trophy className="size-4 text-primary" aria-hidden />
          Leaderboard
        </CardTitle>
        <div className="flex rounded-full border border-border bg-muted/40 p-0.5" role="tablist" aria-label="Leaderboard period">
          {(Object.keys(PERIOD_LABELS) as MpPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-full px-3 py-1 text-ds-caption font-semibold transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isPending ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Leaderboard is unavailable right now.</p>
        ) : !data?.items.length ? (
          <p className="text-ds-caption text-muted-foreground">
            No points yet {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'}. Move a prospect forward to take the top spot.
          </p>
        ) : (
          <>
            {data.items.map((row) => (
              <div
                key={row.user_id}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm',
                  row.user_id === myId && 'bg-primary/10 ring-1 ring-primary/30',
                )}
              >
                <span className={cn('w-6 shrink-0 text-center font-bold tabular-nums', MEDAL_COLORS[row.rank - 1] ?? 'text-muted-foreground')}>
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.name}
                  {row.user_id === myId ? <span className="ml-1 text-ds-caption text-primary">(you)</span> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{row.mp} MP</span>
              </div>
            ))}
            {meOutsideTop && data.me ? (
              <div className="mt-1 flex items-center gap-3 rounded-md border-t border-border/60 bg-primary/10 px-2 py-1.5 pt-2 text-sm">
                <span className="w-6 shrink-0 text-center font-bold tabular-nums text-primary">{data.me.rank}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">You</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{data.me.mp} MP</span>
              </div>
            ) : null}
            {!data.me ? (
              <p className="pt-1 text-ds-caption text-muted-foreground">You&apos;re not on the board yet — every verified step earns MYLE Points.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
