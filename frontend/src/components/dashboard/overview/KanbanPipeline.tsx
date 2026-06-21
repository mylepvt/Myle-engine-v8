import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Layers, TrendingDown, TrendingUp } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useStageCounts } from '@/hooks/use-stage-counts-query'

type StageDef = {
  key: string
  label: string
  color: string
}

const COLUMNS: { title: string; color: string; stages: StageDef[] }[] = [
  {
    title: 'Top of Funnel',
    color: '#818cf8',
    stages: [
      { key: 'claimed', label: 'Just Claimed', color: '#818cf8' },
      { key: 'contacted', label: 'Contacted', color: '#60a5fa' },
      { key: 'invited', label: 'Invited', color: '#38bdf8' },
    ],
  },
  {
    title: 'Engagement',
    color: '#22d3ee',
    stages: [
      { key: 'video_sent', label: 'Enrollment Live', color: '#22d3ee' },
      { key: 'video_watched', label: 'Video Watched', color: '#6ee7b7' },
      { key: 'day1', label: 'Day 1', color: '#84cc16' },
    ],
  },
  {
    title: 'Conversion',
    color: '#f43f5e',
    stages: [
      { key: 'day2', label: 'Day 2', color: '#eab308' },
      { key: 'day3', label: 'Day 3', color: '#fb923c' },
      { key: 'converted', label: 'Converted', color: '#f43f5e' },
    ],
  },
]

const STAGE_ROUTES: Record<string, string> = {
  claimed: '/dashboard/work/leads',
  contacted: '/dashboard/work/leads?stage=contacted',
  invited: '/dashboard/work/leads?stage=invited',
  video_sent: '/dashboard/work/leads?stage=video_sent',
  video_watched: '/dashboard/work/leads?stage=video_watched',
  day1: '/dashboard/work/workboard?tab=day1',
  day2: '/dashboard/work/workboard?tab=day2',
  day3: '/dashboard/work/workboard?tab=day3',
  converted: '/dashboard/work/leads?stage=converted',
}

function Trend({ current, previous }: { current: number; previous?: number }) {
  if (previous == null) return null
  if (current > previous) {
    return <TrendingUp className="size-3 text-emerald-500" aria-label="up" />
  }
  if (current < previous) {
    return <TrendingDown className="size-3 text-red-500" aria-label="down" />
  }
  return null
}

export function KanbanPipeline() {
  const [mode, setMode] = useState<'24h' | 'month'>('24h')
  const { data, isPending, isError } = useStageCounts(true, mode === '24h' ? 24 : undefined, mode === 'month' ? 'month' : undefined)

  const pipelineCounts = useMemo<Record<string, number>>(() => {
    if (!data?.today_movements) return {}
    return {
      ...data.today_movements,
      claimed: data.today_claimed ?? 0,
    }
  }, [data])

  const prevCounts = useMemo<Record<string, number> | null>(() => {
    if (!data?.previous_movements) return null
    return {
      ...data.previous_movements,
      claimed: data.previous_claimed ?? 0,
    }
  }, [data])

  const maxCount = useMemo(() => {
    const vals = Object.values(pipelineCounts)
    if (vals.length === 0) return 1
    return Math.max(1, ...vals)
  }, [pipelineCounts])

  const totalPipeline = useMemo(() => {
    return Object.values(pipelineCounts).reduce((a, b) => a + b, 0)
  }, [pipelineCounts])

  if (isPending) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, ci) => (
              <div key={ci} className="space-y-3 rounded-xl border border-border/40 p-4">
                <Skeleton className="h-4 w-28" />
                {Array.from({ length: 3 }).map((_, si) => (
                  <Skeleton key={si} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Pipeline Board</h2>
          </div>
          <p className="py-8 text-center text-ds-body text-muted-foreground">
            Could not load pipeline data.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (totalPipeline === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Pipeline Board</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMode(mode === '24h' ? 'month' : '24h')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all',
                  mode === 'month'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {mode === 'month' ? <Layers className="size-3" /> : <Clock className="size-3" />}
                {mode === 'month' ? 'This Month' : '24 Hours'}
              </button>
              <Link
                to="/dashboard/work/workboard"
                className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
              >
                Open board <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          <p className="py-8 text-center text-ds-body text-muted-foreground">
            {mode === '24h' ? 'No lead movement in the last 24 hours.' : 'No lead movement this month.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden />
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Pipeline Board</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode(mode === '24h' ? 'month' : '24h')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all',
                mode === 'month'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {mode === 'month' ? <Layers className="size-3" /> : <Clock className="size-3" />}
              {mode === 'month' ? 'This Month' : '24 Hours'}
            </button>
            <Link
              to="/dashboard/work/workboard"
              className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
            >
              Open board <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colTotal = col.stages.reduce((sum, s) => sum + ((pipelineCounts[s.key]) || 0), 0)
            return (
              <div key={col.title} className="rounded-xl border border-border/40 bg-card p-4 transition-colors hover:border-border/60">
                <div className="mb-3 flex items-center justify-between border-b border-border/30 pb-2.5" style={{ borderColor: `${col.color}30` }}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: col.color }}>
                    {col.title}
                  </span>
                  <span className="inline-flex items-center gap-1 text-lg font-extrabold tabular-nums" style={{ color: col.color }}>
                    {colTotal}
                    {prevCounts && (
                      <Trend
                        current={colTotal}
                        previous={col.stages.reduce((s, st) => s + ((prevCounts[st.key]) || 0), 0)}
                      />
                    )}
                  </span>
                </div>
                <div className="space-y-2">
                  {col.stages.map((stage) => {
                    const count = (pipelineCounts[stage.key]) || 0
                    const pct = maxCount > 0 ? Math.max(3, (count / maxCount) * 100) : 0
                    const sharePct = totalPipeline > 0 ? Math.round((count / totalPipeline) * 100) : 0
                    const route = STAGE_ROUTES[stage.key] || '/dashboard/work/leads'

                    return (
                      <Link
                        key={stage.key}
                        to={route}
                        title={`View ${stage.label} leads`}
                        className="group block rounded-lg border border-border/30 bg-background/40 p-3 no-underline transition-all hover:border-border/60 hover:bg-muted/30 active:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="size-2 shrink-0 rounded-full ring-1"
                              style={{ backgroundColor: stage.color, boxShadow: `0 0 0 1px ${stage.color}40` }}
                            />
                            <span className="truncate text-[13px] font-medium text-foreground/70 group-hover:text-foreground/90">
                              {stage.label}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 shrink-0 text-base font-extrabold tabular-nums" style={{ color: stage.color }}>
                            {count}
                            {prevCounts && <Trend current={count} previous={prevCounts[stage.key]} />}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: stage.color }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-muted-foreground/60 tabular-nums">
                            {sharePct}%
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
