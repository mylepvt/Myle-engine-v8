import { Link } from 'react-router-dom'

import { useSalesDashboardQuery } from '@/hooks/use-sales-query'
import { cn } from '@/lib/utils'

type Props = {
  enabled?: boolean
  className?: string
}

const SCOPE_LABEL: Record<string, string> = {
  self: 'Your sales',
  downline: 'Your downline',
  all: 'All teams',
}

function inr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/** Role-scoped CC + revenue rollup. Backend decides scope (self/downline/all). */
export function CcSummaryCard({ enabled = true, className }: Props) {
  const { data, isPending, isError } = useSalesDashboardQuery(enabled)

  if (!enabled) return null

  return (
    <div className={cn('surface-elevated p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-ds-label uppercase text-muted-foreground">Case Credits</p>
        {data ? (
          <span className="text-[11px] text-muted-foreground">{SCOPE_LABEL[data.scope] ?? data.scope}</span>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading CC…</p>
      ) : isError || !data || !Array.isArray(data.rows) ? (
        <p className="text-xs text-muted-foreground">CC data unavailable.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-lg font-bold text-emerald-300">
                {Number(data.total_case_credits).toFixed(3)}
              </p>
              <p className="text-[11px] text-muted-foreground">Total CC</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{inr(data.total_amount_cents)}</p>
              <p className="text-[11px] text-muted-foreground">Revenue</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{data.sale_count}</p>
              <p className="text-[11px] text-muted-foreground">Sales</p>
            </div>
          </div>

          {/* Personal-sale commission ("approx cheque") — own leads only, 25% of net. */}
          <div className="flex items-baseline justify-between rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Your cheque (approx)
              </p>
              <p className="text-[10px] text-muted-foreground">
                25% of net • personal sales only
              </p>
            </div>
            <p className="text-xl font-bold text-emerald-300">
              {inr(data.personal_commission_cents)}
            </p>
          </div>

          {data.pending_count > 0 ? (
            <Link
              to="/dashboard/team/sales-approvals"
              className="inline-block text-xs font-medium text-amber-300 underline underline-offset-2"
            >
              {data.pending_count} pending approval{data.pending_count === 1 ? '' : 's'}
            </Link>
          ) : null}

          {data.rows.length > 0 && data.scope !== 'self' ? (
            <ul className="space-y-1 border-t border-border/40 pt-2">
              {data.rows.slice(0, 5).map((r) => (
                <li key={r.owner_user_id ?? 'x'} className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">
                    {r.owner_username ?? `User #${r.owner_user_id ?? '—'}`}
                  </span>
                  <span className="shrink-0 font-medium text-emerald-300">
                    {Number(r.total_case_credits).toFixed(3)} CC
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}
