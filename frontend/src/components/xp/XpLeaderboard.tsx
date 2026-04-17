import { cn } from '@/lib/utils'
import { useXpLeaderboardQuery, LEVEL_COLORS } from '@/hooks/use-xp-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type Props = {
  role: string | null | undefined
}

const RANK_COLORS = ['text-amber-400', 'text-zinc-300', 'text-amber-600']

export function XpLeaderboard({ role }: Props) {
  const isAllowed = role === 'leader' || role === 'admin'
  const { data, isPending, isError } = useXpLeaderboardQuery()

  if (!isAllowed) return null

  if (isPending) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-ds-h3">🏆 This Week&apos;s Leaders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-5 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (isError || !data?.length) return null

  const top10 = data.slice(0, 10)

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-ds-h3">🏆 This Week&apos;s Leaders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top10.map((entry, idx) => {
          const rank = idx + 1
          const colors = LEVEL_COLORS[entry.level] ?? LEVEL_COLORS['rookie']
          const rankColor = RANK_COLORS[idx] ?? 'text-muted-foreground'

          return (
            <div
              key={entry.user_id}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm',
                idx === 0 && 'bg-amber-500/[0.08]',
              )}
            >
              <span className={cn('w-5 shrink-0 text-center font-bold tabular-nums text-xs', rankColor)}>
                {rank}
              </span>
              <span className="flex-1 truncate font-medium text-foreground">
                {entry.name}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs font-semibold shrink-0',
                  colors.bg, colors.text, colors.border,
                )}
              >
                {entry.level_label.toUpperCase()}
              </span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {entry.xp_total.toLocaleString()} XP
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
