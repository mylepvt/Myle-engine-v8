import { cn } from '@/lib/utils'

export type TrendPoint = {
  date: string
  direct: number
  real_active: number
  light_active: number
  closed: number
  closed_ccs: number
  enrollment_total: number
  target_ccs: number
  calls: number
  leads_added: number
  followups: number
}

export type ComparePeriod = {
  label: string
  cc_current: number
  cc_previous: number
  cc_pct: number | null
  activity_current: number
  activity_previous: number
  activity_pct: number | null
}

type Series = { label: string; color: string; values: number[]; dashed?: boolean }

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-elevated space-y-3 p-4">
      <h2 className="text-ds-label uppercase text-muted-foreground">{title}</h2>
      {children}
    </div>
  )
}

/** The three growth charts for a member's trend points. */
export function GrowthTrio({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="surface-elevated p-6">
        <p className="text-sm text-muted-foreground">
          No history yet — fill the sheet for a few days and growth charts appear here.
        </p>
      </div>
    )
  }
  const labels = points.map((p) => p.date.slice(5))
  return (
    <>
      <ChartCard title="CCs vs target">
        <LineChart
          labels={labels}
          series={[
            { label: 'Closed CC', color: '#10b981', values: points.map((p) => p.closed_ccs) },
            { label: 'Target', color: '#f59e0b', dashed: true, values: points.map((p) => p.target_ccs) },
          ]}
        />
      </ChartCard>
      <ChartCard title="Pipeline movement (people)">
        <LineChart
          labels={labels}
          series={[
            { label: 'Direct', color: '#94a3b8', values: points.map((p) => p.direct) },
            { label: 'Real active', color: '#10b981', values: points.map((p) => p.real_active) },
            { label: 'Light active', color: '#f59e0b', values: points.map((p) => p.light_active) },
            { label: 'Closed', color: '#8b5cf6', values: points.map((p) => p.closed) },
          ]}
        />
      </ChartCard>
      <ChartCard title="Real activity (system)">
        <LineChart
          labels={labels}
          series={[
            { label: 'Calls', color: '#38bdf8', values: points.map((p) => p.calls) },
            { label: 'Leads added', color: '#10b981', values: points.map((p) => p.leads_added) },
            { label: 'Follow-ups', color: '#f43f5e', values: points.map((p) => p.followups) },
          ]}
        />
      </ChartCard>
    </>
  )
}

/** Period-over-period growth pills (last 7d, last 30d). */
export function ComparePills({ week, month }: { week: ComparePeriod; month: ComparePeriod }) {
  return (
    <div className="surface-elevated space-y-3 p-4">
      <h2 className="text-ds-label uppercase text-muted-foreground">Growth vs previous period</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[week, month].map((p) => (
          <div key={p.label} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5">
            <p className="mb-1.5 text-xs text-muted-foreground">{p.label}</p>
            <div className="flex items-center justify-between gap-2">
              <Metric name="CC" current={p.cc_current.toFixed(2)} pct={p.cc_pct} />
              <Metric name="Activity" current={String(p.activity_current)} pct={p.activity_pct} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ name, current, pct }: { name: string; current: string; pct: number | null }) {
  const up = pct != null && pct > 0
  const down = pct != null && pct < 0
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{name}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-base font-bold tabular-nums text-foreground">{current}</span>
        {pct == null ? (
          <span className="text-[11px] text-muted-foreground">new</span>
        ) : (
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              up ? 'text-emerald-600 dark:text-emerald-400' : down ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
          >
            {up ? '▲' : down ? '▼' : '='} {Math.abs(pct)}%
          </span>
        )}
      </span>
    </div>
  )
}

/** Dependency-free multi-line SVG chart with a legend. */
export function LineChart({ labels, series }: { labels: string[]; series: Series[] }) {
  const W = 600
  const H = 180
  const padL = 28
  const padR = 8
  const padT = 10
  const padB = 22
  const n = labels.length
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const gridVals = [0, max / 2, max]

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="trend line chart">
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="currentColor" className="text-border/40" strokeWidth={1} />
            <text x={2} y={y(gv) + 3} className="fill-muted-foreground" fontSize={9}>
              {Number.isInteger(max) ? Math.round(gv) : gv.toFixed(1)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          if (n === 1) {
            return <circle key={s.label} cx={x(0)} cy={y(s.values[0] ?? 0)} r={3} fill={s.color} />
          }
          const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
          return (
            <path
              key={s.label}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        })}
        {n <= 12
          ? labels.map((lb, i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                {lb}
              </text>
            ))
          : [0, Math.floor(n / 2), n - 1].map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                {labels[i]}
              </text>
            ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
