import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Crown, Trophy, Wallet } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { SaleDashboardResponse, SaleDashboardRow } from '@/hooks/use-sales-query'

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
  const rows = data?.rows ?? []
  const chequeTotal = rows.reduce((s, r) => s + (r.commission_cents || 0), 0)
  const topCc = [...rows]
    .sort((a, b) => Number(b.total_case_credits) - Number(a.total_case_credits))
    .slice(0, 5)
  const maxCc = Math.max(...topCc.map((r) => Number(r.total_case_credits)), 0.001)

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Case Credit &amp; Cheque</h2>
          </div>
          <Link
            to="/dashboard/finance/recharge-admin"
            className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
          >
            Finance <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {Number(data?.total_case_credits ?? 0).toFixed(3)}
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
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                Top CC contributors
              </p>
              {topCc.length === 0 ? (
                <p className="py-4 text-center text-ds-caption text-muted-foreground">No sales recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {topCc.map((r) => {
                    const cc = Number(r.total_case_credits)
                    const pct = Math.max(Math.round((cc / maxCc) * 100), 6)
                    return (
                      <div key={r.owner_user_id ?? ownerName(r)} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 truncate text-right text-ds-caption text-muted-foreground">
                          {ownerName(r)}
                        </span>
                        <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/50">
                          <div
                            className="flex h-full items-center justify-end rounded-md bg-emerald-500 px-2 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          >
                            <span className="text-[11px] font-bold tabular-nums text-white">{cc.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
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
