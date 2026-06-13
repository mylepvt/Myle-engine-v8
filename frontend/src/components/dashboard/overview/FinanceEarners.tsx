import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Crown, Trophy, Wallet } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useSalesTrendQuery,
  type SaleDashboardResponse,
  type SaleDashboardRow,
  type SaleTrendPoint,
} from '@/hooks/use-sales-query'

function inr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100)
}

function ownerName(r: SaleDashboardRow): string {
  return r.owner_username ?? `User #${r.owner_user_id ?? '—'}`
}

/** Compact INR — ₹1.2L / ₹84k / ₹420. */
function inrShort(cents: number): string {
  const v = (cents || 0) / 100
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`
  return `₹${Math.round(v)}`
}

const RANGES = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const

/* Area (cheque ₹) + line (CC) trend chart — hand-rolled SVG, dual-normalised. */
function TrendChart({ points }: { points: SaleTrendPoint[] }) {
  const W = 700
  const H = 170
  const PAD_T = 12
  const PAD_B = 18
  const n = points.length
  const cc = points.map((p) => Number(p.case_credits))
  const cheque = points.map((p) => p.cheque_cents)
  const maxCc = Math.max(...cc, 1)
  const maxCheque = Math.max(...cheque, 1)
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const yCheque = (v: number) => PAD_T + (1 - v / maxCheque) * (H - PAD_T - PAD_B)
  const yCc = (v: number) => PAD_T + (1 - v / maxCc) * (H - PAD_T - PAD_B)

  const chequeLine = cheque.map((v, i) => `${x(i)},${yCheque(v)}`).join(' ')
  const chequeArea = `M0,${H - PAD_B} L${cheque.map((v, i) => `${x(i)},${yCheque(v)}`).join(' L')} L${W},${H - PAD_B} Z`
  const ccLine = cc.map((v, i) => `${x(i)},${yCc(v)}`).join(' ')

  const hasData = cc.some((v) => v > 0) || cheque.some((v) => v > 0)
  const firstLabel = points[0]?.date.slice(5)
  const lastLabel = points[n - 1]?.date.slice(5)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Case credit and cheque trend">
        <defs>
          <linearGradient id="chequeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={PAD_T + g * (H - PAD_T - PAD_B)} y2={PAD_T + g * (H - PAD_T - PAD_B)} stroke="currentColor" strokeWidth="1" className="text-border/40" vectorEffect="non-scaling-stroke" />
        ))}
        {hasData ? (
          <>
            <path d={chequeArea} fill="url(#chequeFill)" />
            <polyline points={chequeLine} fill="none" stroke="rgb(16 185 129)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <polyline points={ccLine} fill="none" stroke="rgb(59 130 246)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {!hasData && (
        <p className="-mt-24 mb-16 text-center text-ds-caption text-muted-foreground">No approved sales in this window.</p>
      )}
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>{firstLabel}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-full bg-emerald-500" />Cheque</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-full bg-blue-500" />CC</span>
        </div>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Case Credit & Cheque — headline finance totals + CC distribution bars
 * ────────────────────────────────────────────────────────────────────────── */
export function CaseCreditCheque({
  data,
  loading,
}: {
  data: SaleDashboardResponse | undefined
  loading: boolean
}) {
  const [days, setDays] = useState<number>(30)
  const trend = useSalesTrendQuery(days, true)
  const rows = data?.rows ?? []
  const chequeTotal = rows.reduce((s, r) => s + (r.commission_cents || 0), 0)
  const periodCc = Number(trend.data?.total_case_credits ?? 0)
  const periodCheque = trend.data?.total_cheque_cents ?? 0

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Case Credit &amp; Cheque</h2>
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

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {Number(data?.total_case_credits ?? 0).toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground">Total CC</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
                  {inr(chequeTotal)}
                </p>
                <p className="text-[11px] text-muted-foreground">Cheque total</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <p className={cn('text-lg font-bold tabular-nums', (data?.pending_count ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
                  {data?.pending_count ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">Pending</p>
              </div>
            </div>

            <div className="mt-4">
              {trend.isPending ? (
                <Skeleton className="h-44 w-full" />
              ) : (
                <TrendChart points={trend.data?.points ?? []} />
              )}
              <div className="mt-2 flex items-center justify-between text-ds-caption text-muted-foreground">
                <span>Last {days} days</span>
                <span className="tabular-nums">
                  {periodCc.toFixed(2)} CC · <span className="font-semibold text-emerald-600 dark:text-emerald-300">{inrShort(periodCheque)}</span> cheque
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Top Earners — ranked by approx cheque (commission)
 * ────────────────────────────────────────────────────────────────────────── */
const RANK_STYLE = [
  'bg-amber-400/20 text-amber-600 dark:text-amber-400',
  'bg-slate-400/20 text-slate-600 dark:text-slate-300',
  'bg-orange-500/20 text-orange-600 dark:text-orange-400',
]

export function TopEarners({
  data,
  loading,
}: {
  data: SaleDashboardResponse | undefined
  loading: boolean
}) {
  const earners = [...(data?.rows ?? [])]
    .filter((r) => (r.commission_cents || 0) > 0)
    .sort((a, b) => (b.commission_cents || 0) - (a.commission_cents || 0))
    .slice(0, 6)

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Top Earners</h2>
          </div>
          <Link
            to="/dashboard/team/reports"
            className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
          >
            Reports <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : earners.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet className="size-6 text-muted-foreground/40" aria-hidden />
            <p className="text-ds-caption text-muted-foreground">No cheque earnings yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {earners.map((r, i) => (
              <div
                key={r.owner_user_id ?? ownerName(r)}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    RANK_STYLE[i] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {i === 0 ? <Crown className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{ownerName(r)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {Number(r.total_case_credits).toFixed(2)} CC · {r.sale_count} sale{r.sale_count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
                  {inr(r.commission_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
