import { useMemo } from 'react'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'

const STAGE_WIDTHS = [100, 98, 96, 94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74]
const STAGE_NAMES = [
  'Just Claimed', 'New Lead', 'Contacted', 'Invited',
  'Video Sent', 'Min. FLP', 'Mindset Lock', 'Day 1',
  'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Interview', 'Converted',
]
const STAGE_ICONS = ['⚑', '📥', '📞', '✉️', '▶️', '💰', '🔒', '🎯', '📚', '📚', '📚', '📚', '🎤', '🏆']

export function LiveFunnel() {
  const _tick = useFunnelActivityStore((s) => s._tick)
  const getStages = useFunnelActivityStore((s) => s.getStages)
  const stages = useMemo(() => getStages(), [_tick, getStages])
  const allActors = useFunnelActivityStore((s) => s.actors)

  return (
    <div className="w-full">
      {/* Stage cards vertically stacked with subtle funnel taper */}
      <div className="flex flex-col gap-[6px]">
        {stages.map((stage, i) => {
          const funnelWidth = STAGE_WIDTHS[i] ?? 74
          return (
            <div key={stage.key} className="flex justify-center">
              <div
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-2.5 transition-all duration-200 hover:border-border/80 hover:bg-card/70"
                style={{ width: `${funnelWidth}%` }}
              >
                {/* Icon */}
                <span className="text-[15px] shrink-0">{STAGE_ICONS[i] ?? stage.icon}</span>

                {/* Label + count */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-[12px] font-medium text-muted-foreground/80 group-hover:text-foreground/80">
                    {STAGE_NAMES[i] ?? stage.label}
                  </span>
                  {stage.count > 0 && (
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground/90">
                      {stage.count}
                    </span>
                  )}
                </div>

                {/* Dots — actors at this stage */}
                <div className="flex shrink-0 items-center gap-[3px]">
                  {stage.dots.slice(0, 5).map((dot) => (
                    <div
                      key={dot.id}
                      className="relative flex size-[22px] items-center justify-center rounded-full text-[8px] font-bold text-white shadow-sm transition-all duration-500 hover:z-10 hover:scale-125 animate-dot-in"
                      style={{ backgroundColor: dot.color }}
                      title={`${dot.name} — ${dot.stageLabel}`}
                    >
                      {(dot.name[0] ?? '').toUpperCase()}
                      <span
                        className="absolute inset-0 animate-ping rounded-full opacity-25"
                        style={{ backgroundColor: dot.color }}
                      />
                    </div>
                  ))}
                  {stage.dots.length > 5 && (
                    <div className="flex size-[22px] items-center justify-center rounded-full bg-muted/60 text-[8px] font-bold text-muted-foreground">
                      +{stage.dots.length - 5}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {allActors.size > 0 && (
        <div className="mx-auto mt-3 flex max-w-[90%] flex-wrap gap-x-4 gap-y-1.5 border-t border-border/20 pt-3" style={{ width: `${STAGE_WIDTHS[0]}%` }}>
          {Array.from(allActors.values()).slice(0, 10).map((dot) => (
            <div key={dot.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: dot.color }} />
              {dot.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
