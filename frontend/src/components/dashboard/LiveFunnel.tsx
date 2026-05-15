import { useMemo } from 'react'
import { useFunnelActivityStore } from '@/stores/funnel-activity-store'

const MAX_BAR_WIDTH = 100

export function LiveFunnel() {
  const _tick = useFunnelActivityStore((s) => s._tick)
  const getStages = useFunnelActivityStore((s) => s.getStages)
  const stages = useMemo(() => getStages(), [_tick, getStages])

  const maxCount = useMemo(
    () => Math.max(...stages.map((s) => s.count), 1),
    [stages],
  )

  return (
    <div className="space-y-1">
      {stages.map((stage, i) => {
        const barWidth = Math.max((stage.count / maxCount) * MAX_BAR_WIDTH, 8)
        return (
          <div key={stage.key} className="group relative flex items-center gap-3 px-2 py-1.5 transition-colors hover:bg-white/[0.02]">
            {/* Stage icon + label */}
            <div className="flex w-32 shrink-0 items-center gap-1.5">
              <span className="text-[13px]">{stage.icon}</span>
              <span className="truncate text-[11px] font-medium text-muted-foreground/80 group-hover:text-foreground/90">{stage.label}</span>
            </div>

            {/* Funnel bar */}
            <div className="relative flex h-8 flex-1 items-center">
              <div
                className="flex h-7 items-center gap-1 rounded-r-full px-2"
                style={{
                  width: `${barWidth}%`,
                  background: `linear-gradient(90deg, rgba(88,101,242,0.2), rgba(88,101,242,0.08))`,
                  borderLeft: '2px solid rgba(88,101,242,0.3)',
                }}
              >
                {stage.count > 0 && (
                  <span className="text-[11px] font-bold tabular-nums text-foreground/80">{stage.count}</span>
                )}
              </div>

              {/* Dots — actors currently at this stage */}
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 gap-0.5 pl-2">
                {stage.dots.slice(0, 6).map((dot) => (
                  <div
                    key={dot.id}
                    className="relative flex size-6 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-lg transition-all duration-500 hover:z-10 hover:scale-125 animate-dot-in"
                    style={{ backgroundColor: dot.color }}
                    title={`${dot.name} — ${dot.stageLabel}`}
                  >
                    {dot.name.split(/\s+/)[0]?.[0]?.toUpperCase() ?? '?'}
                    {/* Glow ring */}
                    <span
                      className="absolute inset-0 animate-ping rounded-full opacity-30"
                      style={{ backgroundColor: dot.color }}
                    />
                  </div>
                ))}
                {stage.dots.length > 6 && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-muted/50 text-[9px] font-bold text-muted-foreground">
                    +{stage.dots.length - 6}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-t border-border/30 pt-2">
        {Array.from(useFunnelActivityStore.getState().actors.values())
          .slice(0, 8)
          .map((dot) => (
            <div key={dot.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: dot.color }}
              />
              {dot.name}
            </div>
          ))}
      </div>
    </div>
  )
}
