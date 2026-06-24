import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type OverviewRow = {
  subject_user_id: number
  subject_name: string
  filled: boolean
  current_ccs: number
  target_ccs: number
  gap: number
  activity_total: number
  match_overall: string
  flagged: boolean
}
type Overview = {
  sheet_date: string
  rows: OverviewRow[]
  flagged_count: number
  not_filled_count: number
}

function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Props = { title: string }

export function CurrentCcBoardPage({ title }: Props) {
  const navigate = useNavigate()
  const [dateIso, setDateIso] = useState(todayIsoLocal)

  const q = useQuery({
    queryKey: ['current-cc-overview', dateIso],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/current-cc/overview?date=${encodeURIComponent(dateIso)}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<Overview>
    },
  })

  const rows = q.data?.rows ?? []
  const total = rows.length
  const behind = rows.filter((r) => r.filled && r.gap > 0).length

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ds-h1">{title}</h1>
          <p className="text-sm text-muted-foreground">Who needs attention today — tap a name for their charts.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground"
          />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Not filled" value={`${q.data?.not_filled_count ?? 0} / ${total}`} tone="warning" />
        <Kpi label="Flagged (no activity)" value={String(q.data?.flagged_count ?? 0)} tone="danger" />
        <Kpi label="Behind target" value={String(behind)} tone="plain" />
      </div>

      {q.isPending ? <Skeleton className="h-64 w-full rounded" /> : null}
      {q.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load'}
        </p>
      ) : null}

      {q.data ? (
        <div className="surface-elevated overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-normal">Member</th>
                <th className="px-2 py-2.5 font-normal">Filled</th>
                <th className="px-2 py-2.5 font-normal">CC vs target</th>
                <th className="px-2 py-2.5 font-normal">Activity</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.subject_user_id}
                  onClick={() => navigate(`/dashboard/team/cc-board/${r.subject_user_id}`)}
                  className={cn(
                    'cursor-pointer border-t border-border/40 transition hover:bg-muted/40',
                    r.flagged ? 'bg-red-500/[0.06]' : !r.filled ? 'bg-amber-500/[0.05]' : '',
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Dot tone={r.flagged ? 'danger' : !r.filled ? 'warning' : 'success'} />
                      <span className="text-foreground">{r.subject_name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    {r.filled ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums">
                    {r.filled ? (
                      <>
                        <span className={r.gap > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {r.current_ccs.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground"> / {r.target_ccs.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn('px-2 py-3 tabular-nums', r.flagged ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
                    {r.activity_total}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">›</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No team members to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Red = flagged (CCs claimed, no activity) · amber = not filled · tap a row for that member's charts.
      </p>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'warning' | 'danger' | 'plain' }) {
  const color =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground'
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
    </div>
  )
}

function Dot({ tone }: { tone: 'danger' | 'warning' | 'success' }) {
  const bg = tone === 'danger' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', bg)} />
}
