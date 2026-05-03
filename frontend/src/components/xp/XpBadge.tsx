import { cn } from '@/lib/utils'
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

  return (
    <Card className="border-primary/20 rounded-2xl">
      <CardContent className="pt-5 pb-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                colors.bg, colors.text, colors.border,
              )}
            >
              ⚡ {data.level_label.toUpperCase()}
            </span>
            {seasonLabel && (
              <span className="text-[0.65rem] text-muted-foreground/70 font-medium">
                {seasonLabel}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.xp_total.toLocaleString()} XP
          </span>
        </div>

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
          {data.streak >= 2 && (
            <span className="font-medium text-amber-400">
              🔥 {data.streak} day streak
            </span>
          )}
        </div>

        {/* Last month result */}
        {lastMonth && (
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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
