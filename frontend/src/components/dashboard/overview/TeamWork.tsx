import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, BarChart3, PhoneCall, UserPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamWorkTrendQuery, type TeamReportsPayload } from '@/hooks/use-team-reports-query'

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const

/* ──────────────────────────────────────────────────────────────────────────
 * Today's Claim ↔ Calling — claimed vs called today + top callers
 * ────────────────────────────────────────────────────────────────────────── */
export function TodayClaimCalling({
  data,
  loading,
}: {
  data: TeamReportsPayload | undefined
  loading: boolean
}) {
  const ls = data?.live_summary
  const topCallers = useMemo(() => {
    return [...(data?.items ?? [])]
      .filter((r) => (r.total_calling || 0) > 0)
      .sort((a, b) => (b.total_calling || 0) - (a.total_calling || 0))
      .slice(0, 4)
  }, [data?.items])
  const reporters = data?.items?.length ?? 0
  const scope = data?.scope_total_members ?? 0

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Today’s Claim ↔ Calling</h2>
          </div>
          <Link to="/dashboard/team/reports" className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline">
            Reports <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="flex items-stretch gap-3">
              <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-center">
                <UserPlus className="mx-auto size-4 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {ls?.leads_claimed_today ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">Claimed today</p>
              </div>
              <div className="flex items-center text-muted-foreground">
                <ArrowLeftRight className="size-5" aria-hidden />
              </div>
              <div className="flex-1 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-center">
                <PhoneCall className="mx-auto size-4 text-blue-600 dark:text-blue-400" aria-hidden />
                <p className="mt-1 text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  {ls?.calls_made_today ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">Calls today</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">Top callers today</p>
                <span className="text-[11px] text-muted-foreground">{reporters}/{scope} reported</span>
              </div>
              {topCallers.length === 0 ? (
                <p className="py-3 text-center text-ds-caption text-muted-foreground">No calls logged yet today.</p>
              ) : (
                <div className="space-y-1.5">
                  {topCallers.map((r) => (
                    <div key={r.user_id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.member_name}</span>
                      <span className="shrink-0 text-ds-caption text-muted-foreground">{r.day1_count || 0} D1</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                        {r.total_calling}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Team Work graph — daily calls area+line with Today/7/30/90 toggle
 * ────────────────────────────────────────────────────────────────────────── */
function CallsAreaChart({ points, max }: { points: { date: string; calls: number }[]; max: number }) {
  const W = 700
  const H = 150
  const PAD_T = 10
  const PAD_B = 8
  const n = points.length
  const hasData = points.some((p) => p.calls > 0)
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B)

  // Single day (Today) → draw a flat segment across the width so it's visible.
  const coords = n === 1 ? [`0,${y(points[0].calls)}`, `${W},${y(points[0].calls)}`] : points.map((p, i) => `${x(i)},${y(p.calls)}`)
  const line = coords.join(' ')
  const area = `M0,${H - PAD_B} L${coords.join(' L')} L${W},${H - PAD_B} Z`

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Team work — daily calls">
        <defs>
          <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={PAD_T + g * (H - PAD_T - PAD_B)} y2={PAD_T + g * (H - PAD_T - PAD_B)} stroke="currentColor" strokeWidth="1" className="text-border/40" vectorEffect="non-scaling-stroke" />
        ))}
        {hasData ? (
          <>
            <path d={area} fill="url(#callsFill)" />
            <polyline points={line} fill="none" stroke="rgb(59 130 246)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-ds-caption text-muted-foreground">No team reports in this window yet.</p>
        </div>
      )}
    </div>
  )
}

export function TeamWorkTrend() {
  const [days, setDays] = useState<number>(7)
  const trend = useTeamWorkTrendQuery(days, true)
  const points = trend.data?.points ?? []
  const max = Math.max(...points.map((p) => p.calls), 1)

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Team Work</h2>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold transition',
                  days === r.days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {trend.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <CallsAreaChart points={points} max={max} />
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span>{points[0]?.date.slice(5)}</span>
              <span>{points[points.length - 1]?.date.slice(5)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/40 pt-3 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{trend.data?.total_calls ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Calls</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-violet-600 dark:text-violet-400">{trend.data?.total_day1 ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Day 1</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{trend.data?.total_payments ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">Payments</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
