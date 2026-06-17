import { Lightbulb, TrendingUp, BarChart3 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBlockerIntelligence } from '@/hooks/use-blocker-intelligence-query'

function BlockerBar({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function BlockerIntelligencePanel({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = useBlockerIntelligence()

  if (isPending) {
    return (
      <Card className={className}>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10" />)}
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load blocker intelligence.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (data.total_current === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <BarChart3 className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-semibold text-foreground">No blockers this period</p>
          <p className="text-xs text-muted-foreground mt-1">Blocker data will appear as members report mission blockers.</p>
        </CardContent>
      </Card>
    )
  }

  const barColors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500',
    'bg-blue-500', 'bg-purple-500', 'bg-gray-500',
  ]

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="size-4 text-primary" />
            Blocker Intelligence
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{data.total_current} total</Badge>
            {data.total_previous > 0 && (
              <Badge variant={data.total_current > data.total_previous ? 'destructive' : 'secondary'} className="text-[10px]">
                <TrendingUp className="mr-0.5 size-3" />
                {data.total_current > data.total_previous ? '+' : ''}{data.total_current - data.total_previous} vs last 30d
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Distribution bars */}
        <div className="space-y-2.5">
          {data.current_summary.map((b, i) => (
            <BlockerBar
              key={b.reason}
              label={b.label}
              pct={b.pct}
              count={b.count}
              color={barColors[i % barColors.length]}
            />
          ))}
        </div>

        {/* Suggestion */}
        {data.biggest_blocker && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/10 p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {data.biggest_blocker_label}
                </p>
                <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/80 whitespace-pre-line">
                  {data.suggestion}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
