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
  { key: 'claimed',      label: 'Just Claimed',  color: '#7c3aed' },
  { key: 'contacted',    label: 'Contacted',      color: '#4f86f7' },
  { key: 'invited',      label: 'Invited',        color: '#38bdf8' },
  { key: 'video_sent',   label: 'Day 1st Live',   color: '#22d3ee' },
  { key: 'mindset_lock', label: 'Mindset Lock',   color: '#6ee7b7' },
  { key: 'day1',         label: 'Day 1',          color: '#84cc16' },
  { key: 'day2',         label: 'Day 2',          color: '#eab308' },
  { key: 'day3',         label: 'Day 3',          color: '#f59e0b' },
  { key: 'paid',         label: 'Min. FLP',       color: '#10b981' },
  { key: 'day4',         label: 'Day 4',          color: '#f97316' },
  { key: 'day5',         label: 'Day 5',          color: '#ef4444' },
  { key: 'interview',    label: 'Interview',      color: '#e879f9' },
  { key: 'converted',    label: 'Converted',      color: '#f43f5e' },
]

const STAGE_ROUTES: Record<string, string> = {
  claimed:      '/dashboard/work/leads?stage=claimed',
  contacted:    '/dashboard/work/leads?stage=contacted',
  invited:      '/dashboard/work/leads?stage=invited',
  video_sent:   '/dashboard/work/leads?stage=video_sent',
  paid:         '/dashboard/team/flp-min-billing',
  mindset_lock: '/dashboard/work/workboard',
  day1:         '/dashboard/work/workboard',
  day2:         '/dashboard/work/workboard?tab=day2',
  day3:         '/dashboard/work/workboard?tab=day3',
  day4:         '/dashboard/work/workboard?tab=day4',
  day5:         '/dashboard/work/workboard?tab=day5',
  interview:    '/dashboard/work/workboard?tab=interview',
  converted:    '/dashboard/work/leads?stage=converted',
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
    day4:      liveDash.day4Total,
    day5:      liveDash.day5Total,
    converted: liveDash.enrolledToday,
  }

  const rows = useMemo(() =>
    PIPELINE.map((stage) => {
      const count = (counts[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
      const movement = (todayMov[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
      return { stage, count, movement }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, todayMov, liveOverrides.claimed, liveOverrides.day1, liveOverrides.day2,
     liveOverrides.day3, liveOverrides.day4, liveOverrides.day5, liveOverrides.converted],
  )

  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows])

  return (
    <div className="divide-y divide-white/[0.04]">
      {rows.map(({ stage, count, movement }, i) => {
        const barWidth = count > 0 ? Math.max(4, (count / maxCount) * 100) : 0
        const isUp = movement > 0

        return (
          <Link
            key={stage.key}
            to={stageRoute(stage.key)}
            title={`View ${stage.label} leads`}
            className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-white/[0.04] active:bg-white/[0.07] cursor-pointer"
          >
            <span className="w-5 shrink-0 text-[10px] tabular-nums text-white/25">
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

            <span className="w-24 shrink-0 truncate text-[12px] font-medium text-foreground/70">
              {stage.label}
            </span>

            <div className="flex-1 overflow-hidden rounded-sm bg-white/[0.04]" style={{ height: '6px' }}>
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${barWidth}%`, backgroundColor: `${stage.color}99` }}
              />
            </div>

            <span
              className="w-10 shrink-0 text-right text-[13px] font-bold tabular-nums"
              style={{ color: count > 0 ? stage.color : 'rgba(255,255,255,0.15)' }}
            >
              {count > 0 ? count.toLocaleString() : '–'}
            </span>

            <span
              className={`w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                isUp ? 'text-emerald-400' : movement < 0 ? 'text-red-400' : 'text-white/15'
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
