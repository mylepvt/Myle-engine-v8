import { useMemo } from 'react'
import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'

type Stage = {
  key: string
  label: string
  icon: string
  color: string
  widthPct: number
}

// Each stage container shrinks 6% — clip-path insets 3% per side at bottom.
// Math: stage N bottom clip width = stage N+1 container width
// → adjacent card edges form geometrically continuous diagonal lines (true funnel silhouette).
const PIPELINE: Stage[] = [
  { key: 'claimed',      label: 'Just Claimed',  icon: '⚑',  color: '#7c3aed', widthPct: 100 },
  { key: 'new_lead',     label: 'New Lead',       icon: '📥', color: '#5865f2', widthPct: 94  },
  { key: 'contacted',    label: 'Contacted',      icon: '📞', color: '#4f86f7', widthPct: 88  },
  { key: 'invited',      label: 'Invited',        icon: '✉️', color: '#38bdf8', widthPct: 82  },
  { key: 'video_sent',   label: 'Video Sent',     icon: '▶️', color: '#22d3ee', widthPct: 76  },
  { key: 'paid',         label: 'Min. FLP',       icon: '💰', color: '#10b981', widthPct: 70  },
  { key: 'mindset_lock', label: 'Mindset Lock',   icon: '🔒', color: '#6ee7b7', widthPct: 64  },
  { key: 'day1',         label: 'Day 1',          icon: '🎯', color: '#84cc16', widthPct: 58  },
  { key: 'day2',         label: 'Day 2',          icon: '📚', color: '#eab308', widthPct: 52  },
  { key: 'day3',         label: 'Day 3',          icon: '📚', color: '#f59e0b', widthPct: 46  },
  { key: 'day4',         label: 'Day 4',          icon: '📚', color: '#f97316', widthPct: 40  },
  { key: 'day5',         label: 'Day 5',          icon: '📚', color: '#ef4444', widthPct: 34  },
  { key: 'interview',    label: 'Interview',      icon: '🎤', color: '#e879f9', widthPct: 28  },
  { key: 'converted',    label: 'Converted',      icon: '🏆', color: '#f43f5e', widthPct: 22  },
]

// Trapezoid clip-path: full width at top, 3% inset per side at bottom.
// Left edge (0,0)→(3%,100%) + right edge (100%,0)→(97%,100%) = slanted sides.
// With 6%-per-step container shrink, edges are one continuous diagonal across all stages.
const TRAP = 'polygon(0% 0%, 100% 0%, 97% 100%, 3% 100%)'

function sparkPath(seed: number, w = 34, h = 10): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const x = (i / 5) * w
    const noise = Math.sin(i * 2.1 + seed * 0.7) * 0.3
    const y = h - Math.max(1, Math.min(h - 1, (i / 5 * 0.6 + 0.2 + noise) * h))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
}

function Sparkline({ count, color }: { count: number; color: string }) {
  return (
    <svg width={34} height={10} viewBox="0 0 34 10" fill="none" className="shrink-0 opacity-50">
      <path d={sparkPath(count)} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StageDots({ stageKey }: { stageKey: string }) {
  const _tick = useFunnelActivityStore((s) => s._tick)
  const getStages = useFunnelActivityStore((s) => s.getStages)
  const dots = useMemo(
    () => getStages().find((s) => s.key === stageKey)?.dots.slice(0, 2) ?? [],
    [_tick, getStages, stageKey],
  )
  if (!dots.length) return null
  return (
    <div className="flex items-center gap-0.5">
      {dots.map((dot) => (
        <div
          key={dot.id}
          title={dot.name}
          className="relative flex size-3.5 items-center justify-center rounded-full text-[6px] font-bold text-white"
          style={{ backgroundColor: dot.color }}
        >
          {dot.name.split(/\s+/)[0]?.[0]?.toUpperCase() ?? '?'}
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ backgroundColor: dot.color }} />
        </div>
      ))}
    </div>
  )
}

export function LiveFunnelColumn() {
  const stageCounts = useStageCounts()
  const liveDash = useLiveDashboardStore()
  const counts = stageCounts.data?.counts ?? {}
  const todayMov = stageCounts.data?.today_movements ?? {}

  const liveOverrides: Record<string, number> = {
    claimed:   liveDash.claimedToday,
    day1:      liveDash.day1Total,
    day2:      liveDash.day2Total,
    day3:      liveDash.day3Total,
    day4:      liveDash.day4Total,
    day5:      liveDash.day5Total,
    converted: liveDash.enrolledToday,
  }

  return (
    <div className="flex flex-col items-center gap-px py-3 px-2">
      {PIPELINE.map((stage) => {
        const count = (counts[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
        const movement = (todayMov[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
        const isUp = movement > 0
        const w = stage.widthPct

        // Content hides progressively as cards narrow
        const showLabel     = w >= 52
        const showSparkline = w >= 46
        const showDots      = w >= 64
        const showTrend     = w >= 34

        return (
          <div
            key={stage.key}
            style={{
              width: `${w}%`,
              clipPath: TRAP,
              // Dark matte fill — clip-path edge IS the visual border
              background: `linear-gradient(170deg, ${stage.color}1e 0%, ${stage.color}0e 55%, ${stage.color}06 100%)`,
              // Top seam glow + depth shadow below each card
              boxShadow: `inset 0 1px 0 ${stage.color}28, 0 2px 8px ${stage.color}12`,
            }}
            className="relative transition-all duration-500"
          >
            <div className="relative z-10 flex items-center gap-1.5 px-3 py-[7px]">

              {/* Live pulse dot */}
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

              {/* Stage icon */}
              <span className="shrink-0 text-[12px] leading-none">{stage.icon}</span>

              {/* Stage label — hidden on narrow cards */}
              {showLabel ? (
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/65">
                  {stage.label}
                </span>
              ) : (
                <div className="flex-1" />
              )}

              {/* Live actor dots — only on wide stages */}
              {showDots && <StageDots stageKey={stage.key} />}

              {/* Count — colored with stage color */}
              <span
                className="shrink-0 text-[13px] font-bold tabular-nums"
                style={{ color: count > 0 ? stage.color : 'rgba(255,255,255,0.15)' }}
              >
                {count > 0 ? count.toLocaleString() : '–'}
              </span>

              {/* Trend arrow */}
              {showTrend && (
                <span
                  className={`shrink-0 w-[26px] text-right text-[10px] font-semibold tabular-nums ${
                    isUp ? 'text-emerald-400' : movement < 0 ? 'text-red-400' : 'text-white/10'
                  }`}
                >
                  {movement !== 0 ? `${isUp ? '↑' : '↓'}${Math.abs(movement)}` : '–'}
                </span>
              )}

              {/* Sparkline */}
              {showSparkline && <Sparkline count={count} color={stage.color} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
