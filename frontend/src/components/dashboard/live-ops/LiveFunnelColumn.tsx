import { useMemo } from 'react'
import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'

type Stage = {
  key: string
  label: string
  icon: string
  color: string
}

const PIPELINE: Stage[] = [
  { key: 'claimed',      label: 'Just Claimed',  icon: '⚑', color: '#7c3aed' },
  { key: 'new_lead',     label: 'New Lead',       icon: '📥', color: '#5865f2' },
  { key: 'contacted',    label: 'Contacted',      icon: '📞', color: '#4f86f7' },
  { key: 'invited',      label: 'Invited',        icon: '✉️', color: '#38bdf8' },
  { key: 'video_sent',   label: 'Video Sent',     icon: '▶️', color: '#22d3ee' },
  { key: 'paid',         label: 'Min. FLP',       icon: '💰', color: '#10b981' },
  { key: 'mindset_lock', label: 'Mindset Lock',   icon: '🔒', color: '#6ee7b7' },
  { key: 'day1',         label: 'Day 1',          icon: '🎯', color: '#a3e635' },
  { key: 'day2',         label: 'Day 2',          icon: '📚', color: '#fbbf24' },
  { key: 'day3',         label: 'Day 3',          icon: '📚', color: '#f59e0b' },
  { key: 'day4',         label: 'Day 4',          icon: '📚', color: '#f97316' },
  { key: 'day5',         label: 'Day 5',          icon: '📚', color: '#ef4444' },
  { key: 'interview',    label: 'Interview',      icon: '🎤', color: '#e879f9' },
  { key: 'converted',    label: 'Converted',      icon: '🏆', color: '#f43f5e' },
]

// Deterministic mini sparkline SVG path
function sparkPath(seed: number, w = 64, h = 18): string {
  const pts = Array.from({ length: 7 }, (_, i) => {
    const x = (i / 6) * w
    const noise = Math.sin((i * 2.1 + seed * 0.7)) * 0.35
    const trend = i / 6
    const y = h - Math.max(2, Math.min(h - 2, (trend * 0.55 + 0.15 + noise) * h))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
}

function Sparkline({ count, color }: { count: number; color: string }) {
  const path = sparkPath(count)
  return (
    <svg width={64} height={18} viewBox="0 0 64 18" fill="none" className="shrink-0 opacity-60">
      <path d={path} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Live actor dots for a stage
function StageDots({ stageKey }: { stageKey: string }) {
  const _tick = useFunnelActivityStore((s) => s._tick)
  const getStages = useFunnelActivityStore((s) => s.getStages)
  const stage = useMemo(() => getStages().find((s) => s.key === stageKey), [_tick, getStages, stageKey])
  const dots = stage?.dots.slice(0, 3) ?? []
  if (!dots.length) return null
  return (
    <div className="flex items-center gap-0.5">
      {dots.map((dot) => (
        <div
          key={dot.id}
          title={dot.name}
          className="relative flex size-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white shadow"
          style={{ backgroundColor: dot.color }}
        >
          {dot.name.split(/\s+/)[0]?.[0]?.toUpperCase() ?? '?'}
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ backgroundColor: dot.color }} />
        </div>
      ))}
      {(stage?.dots.length ?? 0) > 3 && (
        <span className="text-[9px] text-muted-foreground/50">+{(stage?.dots.length ?? 0) - 3}</span>
      )}
    </div>
  )
}

export function LiveFunnelColumn() {
  const stageCounts = useStageCounts()
  const liveDash = useLiveDashboardStore()
  const counts = stageCounts.data?.counts ?? {}
  const todayMov = stageCounts.data?.today_movements ?? {}

  // Merge live store day deltas on top of DB counts
  const liveOverrides: Record<string, number> = {
    claimed: liveDash.claimedToday,
    day1: liveDash.day1Total,
    day2: liveDash.day2Total,
    day3: liveDash.day3Total,
    day4: liveDash.day4Total,
    day5: liveDash.day5Total,
    converted: liveDash.enrolledToday,
  }

  const maxCount = Math.max(
    ...PIPELINE.map((s) => counts[s.key] ?? 0),
    1,
  )

  return (
    <div className="flex flex-col gap-0">
      {PIPELINE.map((stage, idx) => {
        const dbCount = counts[stage.key] ?? 0
        const liveBonus = liveOverrides[stage.key] ?? 0
        const count = dbCount + liveBonus
        const movement = (todayMov[stage.key] ?? 0) + liveBonus
        const funnelPct = Math.max((count / maxCount) * 85, 8)
        const isUp = movement > 0

        return (
          <div
            key={stage.key}
            className="group relative flex items-center gap-0 border-b border-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.025]"
          >
            {/* Row number */}
            <span className="w-6 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground/30">
              {String(idx + 1).padStart(2, '0')}
            </span>

            {/* Live dot indicator */}
            <div className="mr-2 flex size-1.5 shrink-0 items-center justify-center">
              <span
                className="block size-1.5 rounded-full"
                style={{ backgroundColor: stage.color, boxShadow: `0 0 4px ${stage.color}80` }}
              />
            </div>

            {/* Icon */}
            <span className="mr-2 shrink-0 text-sm leading-none">{stage.icon}</span>

            {/* Label */}
            <span className="mr-3 w-28 shrink-0 truncate text-[11px] font-medium text-muted-foreground/80 group-hover:text-foreground/90">
              {stage.label}
            </span>

            {/* Funnel bar */}
            <div className="relative mr-3 flex-1">
              <div
                className="h-6 rounded-r-full transition-all duration-700"
                style={{
                  width: `${funnelPct}%`,
                  background: `linear-gradient(90deg, ${stage.color}28, ${stage.color}0a)`,
                  borderLeft: `2px solid ${stage.color}50`,
                }}
              />
            </div>

            {/* Count */}
            <span className="mr-3 w-10 shrink-0 text-right text-[15px] font-bold tabular-nums text-foreground">
              {count.toLocaleString()}
            </span>

            {/* Movement */}
            <div className={`mr-3 flex w-10 shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums ${isUp ? 'text-emerald-400' : movement < 0 ? 'text-red-400' : 'text-muted-foreground/30'}`}>
              {movement !== 0 && (
                <>
                  <span>{isUp ? '↑' : '↓'}</span>
                  <span>{Math.abs(movement)}</span>
                </>
              )}
              {movement === 0 && <span className="text-muted-foreground/20">–</span>}
            </div>

            {/* Live actor dots */}
            <div className="mr-2 w-14 shrink-0">
              <StageDots stageKey={stage.key} />
            </div>

            {/* Sparkline */}
            <Sparkline count={count} color={stage.color} />
          </div>
        )
      })}
    </div>
  )
}
