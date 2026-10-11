import { Flame, Zap } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyRewardsQuery } from '@/hooks/use-rewards-query'
import { LEVEL_COLORS, useXpMeQuery } from '@/hooks/use-xp-query'
import { cn } from '@/lib/utils'

/** My level (from lifetime MYLE Points) + today's work streak (calls toward the daily target). */
export function LevelCard() {
  const rewards = useMyRewardsQuery()
  const work = useXpMeQuery() // work streak + calls today only — XP itself is no longer shown

  if (rewards.isPending) {
    return (
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-5">
          <Skeleton className="mb-2 h-5 w-24" />
          <Skeleton className="mb-2 h-2 w-full" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    )
  }
  const level = rewards.data?.eligible ? rewards.data.level : undefined
  if (!level) return null

  const colors = LEVEL_COLORS[level.key] ?? LEVEL_COLORS['rookie']
  const progressPct = Math.min(100, Math.max(0, level.progress_pct))
  const streak = work.data?.streak ?? 0
  const target = work.data?.call_target ?? 0
  const callsToday = Math.min(work.data?.calls_today ?? 0, target)
  const callsLeft = Math.max(0, target - (work.data?.calls_today ?? 0))
  const streakSaved = Boolean(work.data?.streak_done_today)

  return (
    <Card className="border-primary/20">
      <CardContent className="space-y-3 pt-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-ds-label font-semibold',
              colors.bg, colors.text, colors.border,
            )}
          >
            <Zap className="size-3" aria-hidden /> {level.label.toUpperCase()}
          </span>
          <span className="text-ds-caption tabular-nums text-muted-foreground">
            {level.mp.toLocaleString('en-IN')} MP
          </span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-ds-caption text-muted-foreground">
            <span>
              {level.next_label && level.next_at != null
                ? `${(level.next_at - level.mp).toLocaleString('en-IN')} MP to ${level.next_label}`
                : 'Top level reached'}
            </span>
            <span className="tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-warning transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-label={`Progress to ${level.next_label ?? 'top level'}`}
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {target > 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-ds-body">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Flame
                  className={cn('size-4', streak > 0 ? 'fill-warning text-warning' : 'text-muted-foreground')}
                  aria-hidden
                />
                {streak > 0 ? `${streak}-day streak` : 'Start a streak today'}
              </span>
              <span className="text-ds-caption tabular-nums text-muted-foreground">
                {callsToday}/{target} calls
              </span>
            </div>
            <p className="mt-1.5 text-ds-caption text-muted-foreground">
              {streakSaved
                ? 'Streak saved for today. See you tomorrow.'
                : `${callsLeft} more ${callsLeft === 1 ? 'call' : 'calls'} today to ${streak > 0 ? 'keep' : 'start'} your streak.`}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
