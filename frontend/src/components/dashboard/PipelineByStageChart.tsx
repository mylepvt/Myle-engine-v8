import { cn } from '@/lib/utils'

export type PipelineStageBar = {
  status: string
  total: number
  label: string
}

const CHART_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

type Props = {
  bars: PipelineStageBar[]
  chartMax: number
  pipelineTotal: number
  className?: string
}

/**
 * Workboard pipeline counts as a readable horizontal bar list (dense CRM / SaaS pattern).
 * Uses theme chart tokens for bar fills; labels stay full width for long legacy stage names.
 */
export function PipelineByStageChart({
  bars,
  chartMax,
  pipelineTotal,
  className,
}: Props) {
  const max = Math.max(chartMax, 1)

  return (
    <div className={cn('space-y-1', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
            Total in pipeline
          </p>
          <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums text-foreground">
            {pipelineTotal}
          </p>
        </div>
        <p className="max-w-sm text-right text-ds-caption text-muted-foreground">
          Bar length is relative to the busiest stage in your view
        </p>
      </div>

      <ul className="max-h-[min(28rem,60vh)] space-y-3 overflow-y-auto overscroll-contain pr-1" role="list">
        {bars.map((b, i) => {
          const pct = max > 0 ? (b.total / max) * 100 : 0
          const fill =
            b.total > 0 ? Math.min(100, Math.max(pct, 6)) : 0
          const fillColor = CHART_VARS[i % CHART_VARS.length]

          return (
            <li key={b.status}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug text-foreground"
                  title={b.label}
                >
                  {b.label}
                </span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums text-sm font-semibold',
                    b.total > 0 ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {b.total}
                </span>
              </div>
              <div
                className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-border/40"
                aria-hidden
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${fill}%`,
                    backgroundColor: fillColor,
                    opacity: b.total > 0 ? 1 : 0,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
