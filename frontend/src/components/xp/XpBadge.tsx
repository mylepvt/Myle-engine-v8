import { cn } from '@/lib/utils'
import { useXpMeQuery, LEVEL_COLORS } from '@/hooks/use-xp-query'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function XpBadge() {
  const { data, isPending, isError } = useXpMeQuery()

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

  return (
    <Card className="border-primary/20 rounded-2xl">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              colors.bg, colors.text, colors.border,
            )}
          >
            ⚡ {data.level_label.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.xp_total.toLocaleString()} XP total
          </span>
        </div>

        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress to next level</span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', colors.bg.replace('/20', '/70'))}
            style={{ width: `${progressPct}%`, backgroundColor: 'var(--color-gold, #D4AF37)' }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{data.daily_xp}</span> XP today
            {' / '}
            <span>{data.daily_cap} cap</span>
          </span>
          {data.streak >= 2 && (
            <span className="font-medium text-amber-400">
              🔥 {data.streak} day streak
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
