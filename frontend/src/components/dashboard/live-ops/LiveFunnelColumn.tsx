import { useMemo } from 'react'
import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'

type Stage = {
  key: string
  label: string
  icon: string
  color: string
  funnelPct: number
}

// Fixed decreasing percentages — defines the visual funnel SHAPE.
// Bar is absolute-positioned background, so this pct applies to full row width.
const PIPELINE: Stage[] = [
  { key: 'claimed',      label: 'Just Claimed',  icon: '⚑',  color: '#7c3aed', funnelPct: 100 },
  { key: 'new_lead',     label: 'New Lead',       icon: '📥', color: '#5865f2', funnelPct: 88  },
  { key: 'contacted',    label: 'Contacted',      icon: '📞', color: '#4f86f7', funnelPct: 77  },
  { key: 'invited',      label: 'Invited',        icon: '✉️', color: '#38bdf8', funnelPct: 66  },
  { key: 'video_sent',   label: 'Video Sent',     icon: '▶️', color: '#22d3ee', funnelPct: 57  },
  { key: 'paid',         label: 'Min. FLP',       icon: '💰', color: '#10b981', funnelPct: 48  },
  { key: 'mindset_lock', label: 'Mindset Lock',   icon: '🔒', color: '#6ee7b7', funnelPct: 40  },
  { key: 'day1',         label: 'Day 1',          icon: '🎯', color: '#84cc16', funnelPct: 33  },
  { key: 'day2',         label: 'Day 2',          icon: '📚', color: '#eab308', funnelPct: 27  },
  { key: 'day3',         label: 'Day 3',          icon: '📚', color: '#f59e0b', funnelPct: 22  },
  { key: 'day4',         label: 'Day 4',          icon: '📚', color: '#f97316', funnelPct: 18  },
  { key: 'day5',         label: 'Day 5',          icon: '📚', color: '#ef4444', funnelPct: 14  },
  { key: 'interview',    label: 'Interview',      icon: '🎤', color: '#e879f9', funnelPct: 10  },
  { key: 'converted',    label: 'Converted',      icon: '🏆', color: '#f43f5e', funnelPct: 7   },
]

function sparkPath(seed: number, w = 52, h = 14): string {
  const pts = Array.from({ length: 7 }, (_, i) => {
    const x = (i / 6) * w
    const noise = Math.sin(i * 2.1 + seed * 0.7) * 0.3
    const y = h - Math.max(2, Math.min(h - 2, (i / 6 * 0.6 + 0.2 + noise) * h))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
}

function Sparkline({ count, color }: { count: number; color: string }) {
  return (
    <svg width={52} height={14} viewBox="0 0 52 14" fill="none" className="shrink-0 opacity-60">
      <path d={sparkPath(count)} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StageDots({ stageKey }: { stageKey: string }) {
  const _tick = useFunnelActivityStore((s) => s._tick)
  const getStages = useFunnelActivityStore((s) => s.getStages)
  const dots = useMemo(
    () => getStages().find((s) => s.key === stageKey)?.dots.slice(0, 3) ?? [],
    [_tick, getStages, stageKey],
  )
  if (!dots.length) return null
  return (
    <div className="flex items-center gap-0.5">
      {dots.map((dot) => (
        <div
          key={dot.id}
          title={dot.name}
          className="relative flex size-4 items-center justify-center rounded-full text-[7px] font-bold text-white"
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
    <div className="flex flex-col">
      {PIPELINE.map((stage, idx) => {
        const count = (counts[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
        const movement = (todayMov[stage.key] ?? 0) + (liveOverrides[stage.key] ?? 0)
        const isUp = movement > 0

        return (
          <div
            key={stage.key}
            className="group relative overflow-hidden border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
          >
            {/* ── Funnel bar — absolute background, spans full row width at funnelPct% ── */}
            <div
              className="absolute inset-y-0 left-0 transition-all duration-700"
              style={{
                width: `${stage.funnelPct}%`,
                background: `linear-gradient(90deg, ${stage.color}25 0%, ${stage.color}0a 75%, transparent 100%)`,
                borderRight: `1.5px solid ${stage.color}40`,
              }}
            />

            {/* ── Content overlaid on bar ── */}
            <div className="relative flex items-center px-2 py-2 sm:px-3 sm:py-2.5">
              {/* Row # */}
              <span className="mr-2 w-5 shrink-0 text-[10px] tabular-nums text-muted-foreground/25 sm:w-6">
                {String(idx + 1).padStart(2, '0')}
              </span>

              {/* Stage color dot */}
              <span
                className="mr-2 block size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}` }}
              />

              {/* Icon */}
              <span className="mr-1.5 shrink-0 text-[13px] leading-none sm:mr-2">{stage.icon}</span>

              {/* Label */}
              <span className="mr-2 w-[88px] shrink-0 truncate text-[11px] font-medium text-foreground/80 group-hover:text-foreground sm:w-28">
                {stage.label}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Live actor dots — desktop only */}
              <div className="mr-2 hidden sm:block">
                <StageDots stageKey={stage.key} />
              </div>

              {/* Count */}
              <span className="mr-2 min-w-[36px] text-right text-[15px] font-bold tabular-nums text-foreground sm:mr-3 sm:min-w-[44px] sm:text-[16px]">
                {count > 0 ? count.toLocaleString() : '–'}
              </span>

              {/* Trend */}
              <div
                className={`mr-2 flex w-10 shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums sm:mr-3 ${
                  isUp ? 'text-emerald-400' : movement < 0 ? 'text-red-400' : 'text-muted-foreground/25'
                }`}
              >
                {movement !== 0 ? (
                  <><span>{isUp ? '↑' : '↓'}</span><span>{Math.abs(movement)}</span></>
                ) : (
                  <span className="text-muted-foreground/20">–</span>
                )}
              </div>

              {/* Sparkline */}
              <Sparkline count={count} color={stage.color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
