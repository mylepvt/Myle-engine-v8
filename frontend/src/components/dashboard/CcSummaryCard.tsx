import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { SaleDashboardRow } from '@/hooks/use-sales-query'
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
      <p className={cn('text-lg font-bold', accent ? 'text-emerald-300' : 'text-foreground')}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

/** Approx-cheque hero block (personal, 25% of net). */
function ChequeHero({ cents, subtitle }: { cents: number; subtitle: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your cheque (approx)</p>
      <p className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
        {inr2(cents)}
      </p>
      <p className="text-[10px] text-muted-foreground">{subtitle}</p>
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
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Top earners</p>
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
                  className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-xs font-semibold text-emerald-300">
                {inr(r.commission_cents)}
              </span>
            </button>
            {open ? (
              <div className="ml-0 sm:ml-[5.5rem] mb-1 grid grid-cols-3 gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-emerald-300">{cc.toFixed(3)}</p>
                  <p className="text-[10px] text-muted-foreground">CC</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{inr(r.total_amount_cents)}</p>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{r.sale_count}</p>
                  <p className="text-[10px] text-muted-foreground">Sales</p>
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
  const { data, isPending, isError } = useSalesDashboardQuery(enabled)

  if (!enabled) return null

  const isTeamView = data ? data.scope !== 'self' : false
  const teamChequeCents = data?.rows?.reduce((s, r) => s + (r.commission_cents || 0), 0) ?? 0

  return (
    <div className={cn('surface-elevated space-y-3 p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-ds-label uppercase text-muted-foreground">Case Credits &amp; Cheque</p>
        {data ? (
          <span className="text-[11px] text-muted-foreground">
            {SCOPE_LABEL[data.scope] ?? data.scope}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading CC…</p>
      ) : isError || !data || !Array.isArray(data.rows) ? (
        <p className="text-xs text-muted-foreground">CC data unavailable.</p>
      ) : (
        <>
          <ChequeHero
            cents={data.personal_commission_cents}
            subtitle="25% of net • personal sales only"
          />

          {isTeamView ? (
            <div className="flex items-baseline justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {data.scope === 'all' ? 'All-teams cheque total' : 'Team cheque total'}
              </span>
              <span className="text-base font-bold text-emerald-300">{inr(teamChequeCents)}</span>
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
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 underline underline-offset-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              {data.pending_count} pending approval{data.pending_count === 1 ? '' : 's'}
            </Link>
          ) : null}

          {isTeamView && data.rows.length > 0 ? <TopEarners rows={data.rows} /> : null}
        </>
      )}
    </div>
  )
}
