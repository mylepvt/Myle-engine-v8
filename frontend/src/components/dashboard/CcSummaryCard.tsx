import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { SaleDashboardRow, SalesPeriod } from '@/hooks/use-sales-query'
import { useSalesDashboardQuery } from '@/hooks/use-sales-query'
import { cn } from '@/lib/utils'

type Props = {
  enabled?: boolean
  className?: string
}

const SCOPE_LABEL: Record<string, string> = {
  self: 'Your sales',
  downline: 'Your team',
  all: 'All teams',
}

function inr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100)
}

function inr2(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100)
}

/** One KPI tile. */
function Kpi({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className={cn('text-lg font-bold', accent ? 'text-success-ink' : 'text-foreground')}>{value}</p>
      <p className="text-ds-micro text-muted-foreground">{label}</p>
    </div>
  )
}

/** Approx-cheque hero block (personal, 25% of net). */
function ChequeHero({ cents, subtitle }: { cents: number; subtitle: string }) {
  return (
    <div className="rounded-xl border border-success/25 bg-success/[0.06] px-4 py-3">
      <p className="text-ds-micro uppercase tracking-wide text-muted-foreground">Your cheque (approx)</p>
      <p className="bg-gradient-to-r from-success to-success dark:from-success/30 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
        {inr2(cents)}
      </p>
      <p className="text-ds-micro text-muted-foreground">{subtitle}</p>
    </div>
  )
}

/** Top-earners horizontal bars (CC), clickable to drill into a member. */
function TopEarners({ rows }: { rows: SaleDashboardRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const sorted = [...rows].sort(
    (a, b) => Number(b.total_case_credits) - Number(a.total_case_credits),
  )
  const maxCc = Math.max(...sorted.map((r) => Number(r.total_case_credits)), 0.001)

  return (
    <div className="space-y-1.5 border-t border-border/40 pt-2.5">
      <p className="text-ds-micro uppercase tracking-wide text-muted-foreground">Top earners</p>
      {sorted.slice(0, 8).map((r) => {
        const cc = Number(r.total_case_credits)
        const pct = Math.max((cc / maxCc) * 100, 2)
        const id = r.owner_user_id ?? -1
        const open = openId === id
        const name = r.owner_username ?? `User #${r.owner_user_id ?? '—'}`
        return (
          <div key={id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : id)}
              className="flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left hover:bg-background/40"
              aria-expanded={open}
            >
              <span className="w-20 shrink-0 truncate text-xs text-foreground">{name}</span>
              <span className="relative h-3.5 flex-1 overflow-hidden rounded border border-border/60 bg-background/60">
                <span
                  className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-success to-success"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-xs font-semibold text-success-ink">
                {inr(r.commission_cents)}
              </span>
            </button>
            {open ? (
              <div className="ml-0 sm:ml-[5.5rem] mb-1 grid grid-cols-3 gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-success-ink">{cc.toFixed(3)}</p>
                  <p className="text-ds-micro text-muted-foreground">CC</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{inr(r.total_amount_cents)}</p>
                  <p className="text-ds-micro text-muted-foreground">Revenue</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{r.sale_count}</p>
                  <p className="text-ds-micro text-muted-foreground">Sales</p>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Role-scoped CC + revenue + approx-cheque rollup. Backend decides scope. */
export function CcSummaryCard({ enabled = true, className }: Props) {
  // Today first; "All time" is the history view.
  const [period, setPeriod] = useState<SalesPeriod>('today')
  const { data, isPending, isError } = useSalesDashboardQuery(enabled, period)

  if (!enabled) return null

  const isTeamView = data ? data.scope !== 'self' : false
  const teamChequeCents = data?.rows?.reduce((s, r) => s + (r.commission_cents || 0), 0) ?? 0

  return (
    <div className={cn('surface-elevated space-y-3 p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-ds-label uppercase text-muted-foreground">Case Credits &amp; Cheque</p>
        <div className="flex rounded-full border border-border bg-muted/40 p-0.5" role="tablist" aria-label="CC period">
          {(['today', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-ds-micro font-semibold transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p === 'today' ? 'Today' : 'All time'}
            </button>
          ))}
        </div>
      </div>
      {data ? (
        <p className="-mt-2 text-ds-micro text-muted-foreground">{SCOPE_LABEL[data.scope] ?? data.scope}</p>
      ) : null}

      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading CC…</p>
      ) : isError || !data || !Array.isArray(data.rows) ? (
        <p className="text-xs text-muted-foreground">CC data unavailable.</p>
      ) : (
        <>
          <ChequeHero
            cents={data.personal_commission_cents}
            subtitle={period === 'today' ? 'Today · 25% of net · personal sales only' : '25% of net • personal sales only'}
          />

          {isTeamView ? (
            <div className="flex items-baseline justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
              <span className="text-ds-micro uppercase tracking-wide text-muted-foreground">
                {data.scope === 'all' ? 'All-teams cheque total' : 'Team cheque total'}
              </span>
              <span className="text-base font-bold text-success-ink">{inr(teamChequeCents)}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Kpi value={Number(data.total_case_credits).toFixed(3)} label="Total CC" accent />
            <Kpi value={inr(data.total_amount_cents)} label="Revenue" />
            <Kpi value={String(data.sale_count)} label="Sales" />
          </div>

          {data.pending_count > 0 ? (
            <Link
              to="/dashboard/team/sales-approvals"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-ink underline underline-offset-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-warning/30" />
              {data.pending_count} pending approval{data.pending_count === 1 ? '' : 's'}
            </Link>
          ) : null}

          {isTeamView && data.rows.length > 0 ? <TopEarners rows={data.rows} /> : null}
        </>
      )}
    </div>
  )
}
