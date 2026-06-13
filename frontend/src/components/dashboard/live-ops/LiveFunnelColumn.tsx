import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'

type Stage = {
  key: string
  label: string
  color: string
}

const PIPELINE: Stage[] = [
  { key: 'claimed',       label: 'Just Claimed',    color: '#7c3aed' },
  { key: 'contacted',     label: 'Contacted',        color: '#4f86f7' },
  { key: 'invited',       label: 'Invited',          color: '#38bdf8' },
  { key: 'video_sent',    label: 'Enrollment Live',  color: '#22d3ee' },
  { key: 'video_watched', label: 'Video Watched',    color: '#6ee7b7' },
  { key: 'day1',          label: 'Day 1',            color: '#84cc16' },
  { key: 'day2',          label: 'Day 2',            color: '#eab308' },
  { key: 'day3',          label: 'Day 3',            color: '#f59e0b' },
  { key: 'converted',     label: 'Converted',        color: '#f43f5e' },
]

const STAGE_ROUTES: Record<string, string> = {
  claimed:       '/dashboard/work/leads?stage=claimed',
  contacted:     '/dashboard/work/leads?stage=contacted',
  invited:       '/dashboard/work/leads?stage=invited',
  video_sent:    '/dashboard/work/leads?stage=video_sent',
  video_watched: '/dashboard/work/leads?stage=video_watched',
  day1:          '/dashboard/work/workboard?tab=day1',
  day2:          '/dashboard/work/workboard?tab=day2',
  day3:          '/dashboard/work/workboard?tab=day3',
  converted:     '/dashboard/work/leads?stage=converted',
}
function stageRoute(key: string): string {
  return STAGE_ROUTES[key] ?? '/dashboard/work/leads'
}

export function LiveFunnelColumn() {
  const stageCounts = useStageCounts()
  const liveDash = useLiveDashboardStore()
  const counts = stageCounts.data?.counts ?? {}
  const todayMov = stageCounts.data?.today_movements ?? {}

  const liveOverrides: Record<string, number> = {
    claimed:   stageCounts.data?.today_claimed ?? liveDash.claimedToday,
    day1:      liveDash.day1Total,
    day2:      liveDash.day2Total,
    day3:      liveDash.day3Total,
    converted: liveDash.enrolledToday,
  }

  const rows = useMemo(() =>
    PIPELINE.map((stage) => {
      const count = stage.key === 'video_sent'
        ? (todayMov[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
        : (counts[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
      const movement = stage.key === 'video_sent'
        ? 0
        : (todayMov[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
      return { stage, count, movement }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, todayMov, liveOverrides.claimed, liveOverrides.day1, liveOverrides.day2,
     liveOverrides.day3, liveOverrides.converted],
  )

  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows])

  return (
    <div className="divide-y divide-border/40 dark:divide-white/[0.04]">
      {rows.map(({ stage, count, movement }, i) => {
        const barWidth = count > 0 ? Math.max(4, (count / maxCount) * 100) : 0
        const isUp = movement > 0

        return (
          <Link
            key={stage.key}
            to={stageRoute(stage.key)}
            title={`View ${stage.label} leads`}
            className="flex min-h-[44px] items-center gap-2 px-3 py-2.5 no-underline transition-colors hover:bg-muted/30 dark:hover:bg-white/[0.04] active:bg-muted/50 dark:active:bg-white/[0.07] cursor-pointer sm:gap-3 sm:px-4"
          >
            <span className="hidden w-5 shrink-0 text-[10px] tabular-nums text-muted-foreground/50 dark:text-white/25 sm:inline">
              {String(i + 1).padStart(2, '0')}
            </span>

            <span className="relative flex size-1.5 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: stage.color }}
              />
              <span
                className="relative inline-flex size-1.5 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
            </span>

            <span className="w-20 shrink-0 truncate text-[12px] font-medium text-foreground/70 sm:w-24">
              {stage.label}
            </span>

            <div className="flex-1 overflow-hidden rounded-sm bg-muted/30 dark:bg-white/[0.04]" style={{ height: '6px' }}>
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${barWidth}%`, backgroundColor: stage.color }}
              />
            </div>

            <span
              className="w-9 shrink-0 text-right text-[13px] font-bold tabular-nums sm:w-10"
              style={{ color: count > 0 ? stage.color : 'color-mix(in srgb, var(--foreground) 15%, transparent)' }}
            >
              {count > 0 ? count.toLocaleString() : '–'}
            </span>

            <span
              className={`w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums sm:w-8 ${
                isUp ? 'text-emerald-600 dark:text-emerald-400' : movement < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/30 dark:text-white/15'
              }`}
            >
              {movement !== 0 ? `${isUp ? '↑' : '↓'}${Math.abs(movement)}` : '–'}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
