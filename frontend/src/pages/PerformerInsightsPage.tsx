import { useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, TrendingUp, Trophy, Users, PhoneCall, GitPullRequest, DollarSign } from 'lucide-react'
import { usePerformerInsightsQuery } from '@/hooks/use-performer-insights-query'
import { cn } from '@/lib/utils'

const TREND_COLORS: Record<string, string> = {
  improving: 'text-green-600 bg-green-500/10',
  stable: 'text-amber-600 bg-amber-500/10',
  declining: 'text-red-600 bg-red-500/10',
  inactive: 'text-muted-foreground bg-muted/40',
}

const LEVEL_RANK: Record<string, { label: string; min: number; cls: string }> = {
  elite: { label: 'Elite', min: 75, cls: 'bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-600 dark:text-amber-300 font-bold' },
  strong: { label: 'Strong', min: 50, cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  rising: { label: 'Rising', min: 25, cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  low: { label: 'Low', min: 0, cls: 'bg-muted/60 text-muted-foreground' },
}

function scoreLevel(score: number): { label: string; cls: string } {
  for (const l of Object.values(LEVEL_RANK)) {
    if (score >= l.min) return l
  }
  return LEVEL_RANK.low
}

function BreakdownBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums font-medium">{Math.round(value)}</span>
    </div>
  )
}

type Props = { title?: string }

export default function PerformerInsightsPage({ title: _title }: Props) {
  const [days, setDays] = useState(30)
  const { data, isPending, isError, error } = usePerformerInsightsQuery(days)

  const summaryStats = useMemo(() => {
    if (!data) return null
    return {
      total: data.total_members,
      active: data.active_members,
      top: data.top_performer_count,
      avgScore: data.average_score,
    }
  }, [data])

  if (isPending) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded" />)}
        </div>
        <Skeleton className="h-96 w-full rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded border border-red-600/20 bg-red-600/5 p-4 text-sm text-red-600" role="alert">
          {error instanceof Error ? error.message : 'Failed to load performer insights'}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Performer Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Intelligent ranking of who is genuinely working & getting results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1.5 border rounded-md text-sm bg-background"
          >
            <option value={7}>Last 7 days</option>
            <option value={10}>Last 10 days</option>
            <option value={15}>Last 15 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={<Users className="w-4 h-4" />} label="Total Members" value={data.total_members} />
        <SummaryCard icon={<PhoneCall className="w-4 h-4 text-green-600" />} label="Active (reported)" value={data.active_members} />
        <SummaryCard icon={<Trophy className="w-4 h-4 text-amber-600" />} label="Top Performers" value={data.top_performer_count} />
        <SummaryCard icon={<TrendingUp className="w-4 h-4 text-blue-600" />} label="Avg Score" value={`${data.average_score}`} />
      </div>

      {/* Performer list */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Ranking ({data.period_days}-day period)</span>
            <Badge variant="outline" className="text-xs font-normal">
              {data.performers.length} members scored
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6 pb-4">
          {data.performers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No performer data for this period.</p>
          ) : (
            <div className="space-y-2">
              {data.performers.map((p) => {
                const level = scoreLevel(p.composite_score)
                return (
                  <div
                    key={p.user_id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors hover:bg-muted/20',
                      p.rank <= 3 ? 'border-amber-400/30 bg-amber-500/5' : 'border-border',
                    )}
                  >
                    {/* Top row: rank, name, score, badge */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0',
                          p.rank <= 3 ? 'bg-amber-500/20 text-amber-600' : 'bg-muted text-muted-foreground',
                        )}>
                          {p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `#${p.rank}`}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.fbo_id} · {p.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', level.cls)}>
                          {level.label}
                        </span>
                        <span className="text-lg font-bold tabular-nums">{p.composite_score}</span>
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    <div className="space-y-1 mb-2">
                      <BreakdownBar value={p.breakdown.consistency} label="Consistency" color="bg-blue-500" />
                      <BreakdownBar value={p.breakdown.call_activity} label="Call Activity" color="bg-emerald-500" />
                      <BreakdownBar value={p.breakdown.lead_education} label="Lead Education" color="bg-violet-500" />
                      <BreakdownBar value={p.breakdown.pipeline_conversion} label="Pipeline Conv." color="bg-orange-500" />
                      <BreakdownBar value={p.breakdown.results} label="Results" color="bg-rose-500" />
                    </div>

                    {/* Key metrics row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <PhoneCall className="w-3 h-3" /> {p.metrics.total_calls} calls
                      </span>
                      <span>{p.metrics.pickup_rate}% picked</span>
                      <span className="flex items-center gap-1">
                        <GitPullRequest className="w-3 h-3" /> {p.metrics.pipeline_total} pipeline
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> {p.metrics.payments} payments
                      </span>
                      <span>{p.metrics.leads_taken} leads</span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', TREND_COLORS[p.trend] || '')}>
                        {p.trend === 'inactive' ? 'Inactive' : `${p.trend} (${p.trend_pct > 0 ? '+' : ''}${p.trend_pct}%)`}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
