import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = { title: string }

const RANK_ORDER = [
  'none',
  'preferred_customer',
  'fbo',
  'assistant_supervisor',
  'supervisor',
  'assistant_manager',
  'manager',
]

const RANK_META: Record<string, { label: string; cls: string; short: string }> = {
  none:                 { label: 'Not Started',          short: '—',   cls: 'bg-muted/50 text-muted-foreground' },
  preferred_customer:   { label: 'Preferred Customer',   short: 'PC',  cls: 'bg-sky-500/15 text-sky-400' },
  fbo:                  { label: 'FBO',                  short: 'FBO', cls: 'bg-blue-500/15 text-blue-400' },
  assistant_supervisor: { label: 'Assistant Supervisor', short: 'AS',  cls: 'bg-violet-500/15 text-violet-400' },
  supervisor:           { label: 'Supervisor',           short: 'SV',  cls: 'bg-amber-500/15 text-amber-400' },
  assistant_manager:    { label: 'Assistant Manager',    short: 'AM',  cls: 'bg-orange-500/15 text-orange-400' },
  manager:              { label: 'Manager',              short: 'MGR', cls: 'bg-emerald-500/15 text-emerald-400 font-bold' },
}

function RankBadge({ rank }: { rank: string }) {
  const m = RANK_META[rank] ?? RANK_META.none
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide', m.cls)}>
      {m.short}
    </span>
  )
}

function RankProgressBar({ current, cumCC }: { current: string; cumCC: number }) {
  const MILESTONES = [
    { rank: 'assistant_supervisor', label: 'AS', cc: null, note: '2 active months' },
    { rank: 'supervisor',           label: 'SV', cc: 25 },
    { rank: 'assistant_manager',    label: 'AM', cc: 75 },
    { rank: 'manager',              label: 'MGR', cc: 120 },
  ]

  const currentIdx = RANK_ORDER.indexOf(current)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Rank Progress</span>
        <span className="tabular-nums">{cumCC.toFixed(1)} CC cumulative</span>
      </div>
      <div className="relative flex items-center gap-1">
        {MILESTONES.map((m, i) => {
          const reached = RANK_ORDER.indexOf(m.rank) <= currentIdx
          const isCurrent = m.rank === current
          return (
            <div key={m.rank} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  'h-1.5 w-full rounded-full transition-all',
                  reached ? 'bg-primary' : 'bg-border',
                )}
              />
              <span
                className={cn(
                  'text-[0.55rem] font-medium uppercase',
                  isCurrent ? 'text-primary' : reached ? 'text-foreground/70' : 'text-muted-foreground',
                )}
              >
                {m.label}
              </span>
              {m.cc !== undefined && m.cc !== null ? (
                <span className="text-[0.5rem] text-muted-foreground/60 tabular-nums">{m.cc} CC</span>
              ) : (
                <span className="text-[0.5rem] text-muted-foreground/60">{m.note}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', ...opts })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? res.statusText)
  }
  return res.json()
}

export function FLPRankPage({ title }: Props) {
  const qc = useQueryClient()
  const [showTeam, setShowTeam] = useState(false)
  const [ccForm, setCcForm] = useState({ user_id: '', year_month: '', cc_amount: '', entry_type: 'personal', note: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const { data: me, isPending: mePending, isError: meError } = useQuery<Record<string, unknown>>({
    queryKey: ['flp', 'me'],
    queryFn: () => apiFetch('/api/v1/flp/me'),
  })

  const { data: history, isPending: histPending } = useQuery<unknown[]>({
    queryKey: ['flp', 'me', 'history'],
    queryFn: () => apiFetch('/api/v1/flp/me/history'),
  })

  const { data: team, isPending: teamPending } = useQuery<unknown[]>({
    queryKey: ['flp', 'team'],
    queryFn: () => apiFetch('/api/v1/flp/team'),
    enabled: showTeam,
  })

  const recordCC = useMutation({
    mutationFn: (body: typeof ccForm) =>
      apiFetch('/api/v1/flp/cc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, user_id: Number(body.user_id), cc_amount: Number(body.cc_amount) }),
      }),
    onSuccess: (data: Record<string, unknown>) => {
      setFormError(null)
      setFormSuccess(`CC recorded. New rank: ${data.new_rank_label as string}`)
      setCcForm({ user_id: '', year_month: '', cc_amount: '', entry_type: 'personal', note: '' })
      void qc.invalidateQueries({ queryKey: ['flp'] })
    },
    onError: (e: Error) => {
      setFormError(e.message)
      setFormSuccess(null)
    },
  })

  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

      {/* My rank card */}
      {mePending ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : meError || !me ? (
        <p className="text-sm text-destructive">Could not load rank data.</p>
      ) : (
        <div className="surface-elevated rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">My FLP Rank</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {RANK_META[me.flp_rank as string]?.label ?? me.flp_rank as string}
                </span>
                <RankBadge rank={me.flp_rank as string} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">This month</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {(me.current_month_total_cc as number).toFixed(1)} CC
              </p>
              <p className={cn('text-xs font-medium', (me.current_month_active as boolean) ? 'text-emerald-400' : 'text-muted-foreground')}>
                {(me.current_month_active as boolean) ? 'Active' : 'Not active'}
              </p>
            </div>
          </div>

          <RankProgressBar current={me.flp_rank as string} cumCC={me.flp_cumulative_cc as number} />

          {me.next_rank ? (
            <p className="text-xs text-muted-foreground">
              Next: <span className="text-foreground font-medium">{me.next_rank_label as string}</span>
              {(me.cc_needed_for_next_rank as number | null) !== null
                ? ` — ${(me.cc_needed_for_next_rank as number).toFixed(1)} more CC needed`
                : ' — requires consecutive active months'}
            </p>
          ) : (
            <p className="text-xs text-emerald-400 font-medium">Top rank achieved.</p>
          )}

          {me.flp_active_month_1 ? (
            <p className="text-xs text-muted-foreground">
              Active months: <span className="text-foreground">{me.flp_active_month_1 as string}</span>
              {me.flp_active_month_2 ? (
                <> → <span className="text-foreground">{me.flp_active_month_2 as string}</span></>
              ) : ' (need one more consecutive)'}
            </p>
          ) : null}
        </div>
      )}

      {/* CC history */}
      <div className="surface-elevated rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">Monthly CC History</p>
        {histPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : !history || (history as unknown[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No CC recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[0.7rem] text-muted-foreground border-b border-border/60">
                  <th className="py-2 px-3 text-left font-medium">Month</th>
                  <th className="py-2 px-3 text-right font-medium">Personal</th>
                  <th className="py-2 px-3 text-right font-medium">Group</th>
                  <th className="py-2 px-3 text-right font-medium">Total</th>
                  <th className="py-2 px-3 text-center font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {(history as Record<string, unknown>[]).map((r) => (
                  <tr key={r.year_month as string} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                    <td className="py-2 px-3 text-foreground tabular-nums">{r.year_month as string}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{(r.personal_cc as number).toFixed(1)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{(r.group_cc as number).toFixed(1)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{(r.total_cc as number).toFixed(1)}</td>
                    <td className="py-2 px-3 text-center">
                      {(r.is_active as boolean)
                        ? <span className="text-emerald-400 text-xs font-medium">Yes</span>
                        : <span className="text-muted-foreground/60 text-xs">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record CC (admin/leader) */}
      <div className="surface-elevated rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">Record CC Entry</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">User ID</label>
            <input
              type="number"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={ccForm.user_id}
              onChange={(e) => setCcForm((p) => ({ ...p, user_id: e.target.value }))}
              placeholder="123"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Month (YYYY-MM)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={ccForm.year_month}
              onChange={(e) => setCcForm((p) => ({ ...p, year_month: e.target.value }))}
              placeholder={currentMonth}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CC Amount</label>
            <input
              type="number"
              step="0.5"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={ccForm.cc_amount}
              onChange={(e) => setCcForm((p) => ({ ...p, cc_amount: e.target.value }))}
              placeholder="2.0"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={ccForm.entry_type}
              onChange={(e) => setCcForm((p) => ({ ...p, entry_type: e.target.value }))}
            >
              <option value="personal">Personal</option>
              <option value="group">Group</option>
            </select>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={ccForm.note}
              onChange={(e) => setCcForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="Monthly order, retail, etc."
            />
          </div>
        </div>
        {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        {formSuccess ? <p className="text-xs text-emerald-400">{formSuccess}</p> : null}
        <button
          type="button"
          disabled={recordCC.isPending || !ccForm.user_id || !ccForm.year_month || !ccForm.cc_amount}
          onClick={() => { setFormError(null); setFormSuccess(null); recordCC.mutate(ccForm) }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {recordCC.isPending ? 'Saving…' : 'Record CC'}
        </button>
      </div>

      {/* Team view */}
      <div className="surface-elevated rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Team FLP Ranks</p>
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2"
            onClick={() => setShowTeam((v) => !v)}
          >
            {showTeam ? 'Hide' : 'Show'}
          </button>
        </div>
        {showTeam ? (
          teamPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : !team || (team as unknown[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[0.7rem] text-muted-foreground border-b border-border/60">
                    <th className="py-2 px-3 text-left font-medium">Member</th>
                    <th className="py-2 px-3 text-left font-medium">Rank</th>
                    <th className="py-2 px-3 text-right font-medium">Cum. CC</th>
                    <th className="py-2 px-3 text-right font-medium">This Month</th>
                    <th className="py-2 px-3 text-center font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(team as Record<string, unknown>[]).map((r) => (
                    <tr key={r.user_id as number} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                      <td className="py-2 px-3">
                        <p className="font-medium text-foreground truncate max-w-[10rem]">{r.name as string}</p>
                        <p className="text-[0.65rem] text-muted-foreground">{r.fbo_id as string}</p>
                      </td>
                      <td className="py-2 px-3">
                        <RankBadge rank={r.flp_rank as string} />
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{(r.flp_cumulative_cc as number).toFixed(1)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{(r.current_month_total_cc as number).toFixed(1)}</td>
                      <td className="py-2 px-3 text-center">
                        {(r.current_month_active as boolean)
                          ? <span className="text-emerald-400 text-xs">Yes</span>
                          : <span className="text-muted-foreground/60 text-xs">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
