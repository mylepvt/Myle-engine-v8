import { cn } from '@/lib/utils'
import { Flame, Zap } from 'lucide-react'
import { useXpMeQuery, useXpHistoryQuery, LEVEL_COLORS } from '@/hooks/use-xp-query'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function XpBadge() {
  const { data, isPending, isError } = useXpMeQuery()
  const { data: history } = useXpHistoryQuery()

  if (isPending) {
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

  if (isError || !data) return null

  const colors = LEVEL_COLORS[data.level] ?? LEVEL_COLORS['rookie']
  const progressPct = Math.min(100, Math.max(0, data.progress_pct))
  const seasonLabel = data.season_month
    ? `${MONTH_NAMES[(data.season_month ?? 1) - 1]} ${data.season_year ?? ''}`
    : null
  const lastMonth = history?.[0]
  const target = data.call_target ?? 0
  const callsToday = Math.min(data.calls_today ?? 0, target)
  const callsLeft = Math.max(0, target - (data.calls_today ?? 0))
  const streakSaved = Boolean(data.streak_done_today)

  return (
    <Card className="border-primary/20 rounded-md">
      <CardContent className="pt-5 pb-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-ds-label font-semibold',
                colors.bg, colors.text, colors.border,
              )}
            >
              <Zap className="size-3" aria-hidden /> {data.level_label?.toUpperCase() ?? data.level?.toUpperCase() ?? '???'}
            </span>
            {seasonLabel && (
              <span className="text-ds-label text-muted-foreground/70 font-medium">
                {seasonLabel}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.xp_total.toLocaleString()} XP
          </span>
        </div>

        {/* Work streak: today's call target keeps it alive */}
        {target > 0 ? (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Flame
                  className={cn('size-4', data.streak > 0 ? 'fill-warning text-warning' : 'text-muted-foreground')}
                  aria-hidden
                />
                {data.streak > 0 ? `${data.streak}-day streak` : 'Start a streak today'}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {callsToday}/{target} calls
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-warning transition-all duration-500"
                style={{ width: `${target ? (callsToday / target) * 100 : 0}%` }}
                role="progressbar"
                aria-label="Calls toward today's target"
                aria-valuenow={callsToday}
                aria-valuemin={0}
                aria-valuemax={target}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {streakSaved
                ? 'Streak saved for today. See you tomorrow.'
                : `${callsLeft} more ${callsLeft === 1 ? 'call' : 'calls'} today to ${data.streak > 0 ? 'keep' : 'start'} your streak.`}
            </p>
          </div>
        ) : null}

        {/* Progress bar */}
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress to next level</span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500')}
            style={{ width: `${progressPct}%`, background: '#D4AF37' }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Footer row */}
        <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{data.daily_xp}</span>
            {' / '}
            <span>{data.daily_cap} XP today</span>
          </span>
          {data.best_streak && data.best_streak >= 2 ? (
            <span className="text-muted-foreground">Best streak: {data.best_streak} days</span>
          ) : null}
        </div>

        {/* Last month result */}
        {lastMonth && (
          <div className="mt-3 rounded border border-border dark:border-white/[0.07] bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Last month ({MONTH_NAMES[lastMonth.month - 1]}):&nbsp;
            <span className="font-semibold text-foreground">
              {lastMonth.final_xp.toLocaleString()} XP
            </span>
            &nbsp;·&nbsp;
            <span className={cn(LEVEL_COLORS[lastMonth.final_level]?.text)}>
              {lastMonth.final_level.charAt(0).toUpperCase() + lastMonth.final_level.slice(1)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
