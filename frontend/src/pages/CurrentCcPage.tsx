import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  ComparePills,
  GrowthTrio,
  type ComparePeriod,
  type TrendPoint,
} from '@/components/current-cc/growth'
import type {
  Actuals,
  EnrollmentRow,
  LeadCycleRow,
  MatchInfo,
  PersonRow,
  SheetPublic,
  TrackingRow,
} from '@/components/current-cc/sheet-view'

type TeamMember = { user_id: number; name: string }
function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const inputCls =
  'w-full min-w-0 rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-2.5 py-2 text-sm text-foreground disabled:opacity-50'

const emptyPerson = (): PersonRow => ({ name: '', ccs: 0, current_state: '', next_task: '' })
const emptyEnroll = (): EnrollmentRow => ({ name: '', fresh_lead: 0, old_lead: 0 })
const emptyCycle = (): LeadCycleRow => ({ name: '', enrollment: 0, budget_check: false, checked: false })
const emptyTrack = (): TrackingRow => ({ name: '', current_state: '', drop_continue: '', day1: '' })

type FormState = {
  target_ccs: string
  direct_persons: string[]
  direct_total_ccs: string
  real_active_persons: string[]
  light_active_persons: string[]
  closed_persons: PersonRow[]
  pending_persons: PersonRow[]
  enrollment_rows: EnrollmentRow[]
  lead_cycle_rows: LeadCycleRow[]
  lead_covered: string
  process_check: string
  enrollment_tracking_rows: TrackingRow[]
  drop_reason_remarks: string
  improvement_area: string
}

function blankForm(): FormState {
  return {
    target_ccs: '',
    direct_persons: ['', '', '', '', ''],
    direct_total_ccs: '',
    real_active_persons: ['', '', '', '', ''],
    light_active_persons: ['', '', '', '', ''],
    closed_persons: [emptyPerson(), emptyPerson()],
    pending_persons: [emptyPerson(), emptyPerson()],
    enrollment_rows: [emptyEnroll(), emptyEnroll()],
    lead_cycle_rows: [emptyCycle(), emptyCycle()],
    lead_covered: '',
    process_check: '',
    enrollment_tracking_rows: [emptyTrack(), emptyTrack()],
    drop_reason_remarks: '',
    improvement_area: '',
  }
}

function padTo(list: string[], n: number): string[] {
  const out = [...list]
  while (out.length < n) out.push('')
  return out
}

const num = (v: string) => (v.trim() ? Math.max(0, parseFloat(v) || 0) : null)
const int = (v: string) => Math.max(0, parseInt(v, 10) || 0)

type Props = { title: string }

export function CurrentCcPage({ title }: Props) {
  const qc = useQueryClient()
  const { data: me } = useAuthMeQuery()
  const isLeaderOrAdmin = me?.role === 'admin' || me?.role === 'leader'
  const canPickDate = me?.role === 'admin'

  const [searchParams] = useSearchParams()
  // Deep-link: /dashboard/team/current-cc?member=<id> opens that member's form
  // (admin/leader only). Members always see their own.
  const memberParam = searchParams.get('member')

  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [dateIso, setDateIso] = useState(todayIsoLocal)
  const [form, setForm] = useState<FormState>(blankForm)

  const membersQ = useQuery({
    queryKey: ['current-cc-members'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/current-cc/team-members')
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<TeamMember[]>
    },
  })

  useEffect(() => {
    if (subjectId != null || me?.user_id == null) return
    // Admin/leader can open a specific member via ?member=<id>; others get self.
    const wanted = isLeaderOrAdmin && memberParam ? parseInt(memberParam, 10) : NaN
    setSubjectId(Number.isFinite(wanted) ? wanted : me.user_id)
  }, [me?.user_id, subjectId, isLeaderOrAdmin, memberParam])

  const sheetQ = useQuery({
    queryKey: ['current-cc-sheet', subjectId, dateIso],
    enabled: subjectId != null,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/v1/current-cc/sheet?subject_user_id=${subjectId}&date=${encodeURIComponent(dateIso)}`,
      )
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<SheetPublic | null>
    },
  })

  const trendsQ = useQuery({
    queryKey: ['current-cc-trends', subjectId],
    enabled: subjectId != null,
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/current-cc/trends?subject_user_id=${subjectId}&days=30`)
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as { points: TrendPoint[] }
    },
  })

  const compareQ = useQuery({
    queryKey: ['current-cc-compare', subjectId],
    enabled: subjectId != null,
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/current-cc/compare?subject_user_id=${subjectId}`)
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as { week: ComparePeriod; month: ComparePeriod }
    },
  })

  useEffect(() => {
    const row = sheetQ.data
    if (!row) {
      setForm(blankForm())
      return
    }
    const rows = <T,>(list: T[], empty: () => T): T[] => (list?.length ? list : [empty(), empty()])
    setForm({
      target_ccs: row.target_ccs != null ? String(row.target_ccs) : '',
      direct_persons: padTo(row.direct_persons ?? [], 5),
      direct_total_ccs: row.direct_total_ccs != null ? String(row.direct_total_ccs) : '',
      real_active_persons: padTo(row.real_active_persons ?? [], 5),
      light_active_persons: padTo(row.light_active_persons ?? [], 5),
      closed_persons: rows(row.closed_persons, emptyPerson),
      pending_persons: rows(row.pending_persons, emptyPerson),
      enrollment_rows: rows(row.enrollment_rows, emptyEnroll),
      lead_cycle_rows: rows(row.lead_cycle_rows, emptyCycle),
      lead_covered: row.lead_covered ?? '',
      process_check: row.process_check ?? '',
      enrollment_tracking_rows: rows(row.enrollment_tracking_rows, emptyTrack),
      drop_reason_remarks: row.drop_reason_remarks ?? '',
      improvement_area: row.improvement_area ?? '',
    })
  }, [sheetQ.data])

  const closedTotalCcs = useMemo(
    () => form.closed_persons.reduce((s, r) => s + (r.ccs || 0), 0),
    [form.closed_persons],
  )
  const enrollmentTotal = useMemo(
    () => form.enrollment_rows.reduce((s, r) => s + (r.fresh_lead || 0) + (r.old_lead || 0), 0),
    [form.enrollment_rows],
  )

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        subject_user_id: subjectId,
        sheet_date: dateIso,
        target_ccs: num(form.target_ccs),
        direct_persons: form.direct_persons.map((s) => s.trim()).filter(Boolean),
        direct_total_ccs: num(form.direct_total_ccs),
        real_active_persons: form.real_active_persons.map((s) => s.trim()).filter(Boolean),
        light_active_persons: form.light_active_persons.map((s) => s.trim()).filter(Boolean),
        closed_persons: form.closed_persons.filter((r) => r.name.trim() || r.ccs),
        pending_persons: form.pending_persons.filter((r) => r.name.trim() || r.ccs),
        enrollment_rows: form.enrollment_rows.filter((r) => r.name.trim() || r.fresh_lead || r.old_lead),
        lead_cycle_rows: form.lead_cycle_rows.filter(
          (r) => r.name.trim() || r.enrollment || r.budget_check || r.checked,
        ),
        lead_covered: form.lead_covered.trim() || null,
        process_check: form.process_check.trim() || null,
        enrollment_tracking_rows: form.enrollment_tracking_rows.filter(
          (r) => r.name.trim() || r.current_state.trim() || r.drop_continue.trim() || r.day1.trim(),
        ),
        drop_reason_remarks: form.drop_reason_remarks.trim() || null,
        improvement_area: form.improvement_area.trim() || null,
      }
      const res = await apiFetch('/api/v1/current-cc/sheet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<SheetPublic>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['current-cc-sheet'] })
      void qc.invalidateQueries({ queryKey: ['current-cc-trends'] })
      void qc.invalidateQueries({ queryKey: ['current-cc-compare'] })
    },
  })

  // Generic helpers to mutate row arrays in the form.
  function setNames(key: 'direct_persons' | 'real_active_persons' | 'light_active_persons', idx: number, v: string) {
    setForm((p) => {
      const col = [...p[key]]
      col[idx] = v
      return { ...p, [key]: col }
    })
  }
  function updateRow<K extends keyof FormState>(key: K, idx: number, patch: Partial<FormState[K] extends Array<infer R> ? R : never>) {
    setForm((p) => {
      const arr = [...(p[key] as unknown as Record<string, unknown>[])]
      arr[idx] = { ...arr[idx], ...patch }
      return { ...p, [key]: arr } as FormState
    })
  }
  function addRow<K extends keyof FormState>(key: K, empty: () => unknown) {
    setForm((p) => ({ ...p, [key]: [...(p[key] as unknown[]), empty()] }) as FormState)
  }
  function removeRow<K extends keyof FormState>(key: K, idx: number) {
    setForm((p) => ({ ...p, [key]: (p[key] as unknown[]).filter((_, i) => i !== idx) }) as FormState)
  }

  const disabled = mut.isPending

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-ds-h1">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Daily "Current CCs v/s Target CCs" sheet. Today's data is saved; the 30-day CC vs target trend is shown below.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {isLeaderOrAdmin ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Team Member</span>
            <select
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(parseInt(e.target.value, 10))}
              className={inputCls}
            >
              {(membersQ.data ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            disabled={!canPickDate}
            onChange={(e) => setDateIso(e.target.value)}
            className={cn(inputCls, 'disabled:opacity-60')}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Target CCs</span>
          <input
            type="number"
            min={0}
            step="0.001"
            value={form.target_ccs}
            disabled={disabled}
            onChange={(e) => setForm((p) => ({ ...p, target_ccs: e.target.value }))}
            className={cn(inputCls, 'w-28 tabular-nums')}
          />
        </label>
        <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-sm">
          Current CCs: <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{closedTotalCcs.toFixed(3)}</span>
        </span>
      </div>

      {sheetQ.data ? <MatchPanel actuals={sheetQ.data.actuals} match={sheetQ.data.match} /> : null}

      {sheetQ.isPending && subjectId != null ? <Skeleton className="h-40 w-full rounded" /> : null}
      {sheetQ.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {sheetQ.error instanceof Error ? sheetQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void mut.mutateAsync()
        }}
      >
        {/* Two true columns: left = sections 1-5, right = 6-9 (matches the paper
            sheet). On mobile both stack in natural order 1→9. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          {/* LEFT COLUMN — 1 to 5 */}
          <div className="space-y-6">
            {/* 1. Direct Person's */}
            <Section title="1. Direct Person's (Team)" right={
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Total CCs
                <input
                  type="number" min={0} step="0.001" value={form.direct_total_ccs} disabled={disabled}
                  onChange={(e) => setForm((p) => ({ ...p, direct_total_ccs: e.target.value }))}
                  className={cn(inputCls, 'w-24 tabular-nums')}
                />
              </label>
            }>
              <NameList names={form.direct_persons} disabled={disabled} onChange={(i, v) => setNames('direct_persons', i, v)} onAdd={() => addRow('direct_persons', () => '')} />
            </Section>

            {/* 2. Real Active */}
            <Section title="2. Real Active Person's (Team)">
              <NameList names={form.real_active_persons} disabled={disabled} onChange={(i, v) => setNames('real_active_persons', i, v)} onAdd={() => addRow('real_active_persons', () => '')} />
            </Section>

            {/* 3. Light Active */}
            <Section title="3. Light Active Person (Team)">
              <NameList names={form.light_active_persons} disabled={disabled} onChange={(i, v) => setNames('light_active_persons', i, v)} onAdd={() => addRow('light_active_persons', () => '')} />
            </Section>

            {/* 4. Closed Person's List */}
            <Section title="4. Closed Person's List (CC Tracking)" right={<TotalChip label="Total CCs" value={Number(closedTotalCcs.toFixed(3))} />}>
              <PersonTable rows={form.closed_persons} disabled={disabled}
                onChange={(i, patch) => updateRow('closed_persons', i, patch)}
                onAdd={() => addRow('closed_persons', emptyPerson)}
                onRemove={(i) => removeRow('closed_persons', i)} />
            </Section>

            {/* 5. Pending Person CCs */}
            <Section title="5. Pending Person CCs (Prospect)">
              <PersonTable rows={form.pending_persons} disabled={disabled}
                onChange={(i, patch) => updateRow('pending_persons', i, patch)}
                onAdd={() => addRow('pending_persons', emptyPerson)}
                onRemove={(i) => removeRow('pending_persons', i)} />
            </Section>
          </div>

          {/* RIGHT COLUMN — 6 to 9 */}
          <div className="space-y-6">
            {/* 6. Enrollment */}
            <Section title="6. Enrollment (Prospect)" right={<TotalChip label="Total" value={enrollmentTotal} />}>
              <RowHeader cols={['Name', 'Fresh', 'Old', 'Total', '']} grid="grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_2.5rem_1.25rem]" />
              {form.enrollment_rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_2.5rem_1.25rem] items-center gap-1.5">
                  <input value={r.name} placeholder="Name" disabled={disabled} onChange={(e) => updateRow('enrollment_rows', i, { name: e.target.value })} className={inputCls} />
                  <input type="number" min={0} value={r.fresh_lead} disabled={disabled} onChange={(e) => updateRow('enrollment_rows', i, { fresh_lead: int(e.target.value) })} className={cn(inputCls, 'tabular-nums')} />
                  <input type="number" min={0} value={r.old_lead} disabled={disabled} onChange={(e) => updateRow('enrollment_rows', i, { old_lead: int(e.target.value) })} className={cn(inputCls, 'tabular-nums')} />
                  <div className="flex items-center justify-center text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{(r.fresh_lead || 0) + (r.old_lead || 0)}</div>
                  <RemoveBtn onClick={() => removeRow('enrollment_rows', i)} />
                </div>
              ))}
              <AddBtn onClick={() => addRow('enrollment_rows', emptyEnroll)} />
            </Section>

            {/* 7. Lead Cycle Daily */}
            <Section title="7. Lead Cycle Daily (Team)">
              <RowHeader cols={['Name', 'Enroll', 'Budget', 'Check', '']} grid="grid-cols-[minmax(0,1fr)_3.5rem_3rem_2.5rem_1.25rem]" />
              {form.lead_cycle_rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem_2.5rem_1.25rem] items-center gap-1.5">
                  <input value={r.name} placeholder="Name" disabled={disabled} onChange={(e) => updateRow('lead_cycle_rows', i, { name: e.target.value })} className={inputCls} />
                  <input type="number" min={0} value={r.enrollment} disabled={disabled} onChange={(e) => updateRow('lead_cycle_rows', i, { enrollment: int(e.target.value) })} className={cn(inputCls, 'tabular-nums')} />
                  <CheckCell checked={r.budget_check} disabled={disabled} onChange={(v) => updateRow('lead_cycle_rows', i, { budget_check: v })} />
                  <CheckCell checked={r.checked} disabled={disabled} onChange={(v) => updateRow('lead_cycle_rows', i, { checked: v })} />
                  <RemoveBtn onClick={() => removeRow('lead_cycle_rows', i)} />
                </div>
              ))}
              <AddBtn onClick={() => addRow('lead_cycle_rows', emptyCycle)} />
              <TextLine label="Lead Covered" value={form.lead_covered} disabled={disabled} onChange={(v) => setForm((p) => ({ ...p, lead_covered: v }))} />
              <TextLine label="Process Check" value={form.process_check} disabled={disabled} onChange={(v) => setForm((p) => ({ ...p, process_check: v }))} />
            </Section>

            {/* 8. Enrollment Tracking */}
            <Section title="8. Enrollment Tracking (Prospect)">
              <RowHeader cols={['Name', 'State', 'Drop/Cont', 'Day-1', '']} grid="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem_1.25rem]" />
              {form.enrollment_tracking_rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem_1.25rem] items-center gap-1.5">
                  <input value={r.name} placeholder="Name" disabled={disabled} onChange={(e) => updateRow('enrollment_tracking_rows', i, { name: e.target.value })} className={inputCls} />
                  <input value={r.current_state} placeholder="State" disabled={disabled} onChange={(e) => updateRow('enrollment_tracking_rows', i, { current_state: e.target.value })} className={inputCls} />
                  <select value={r.drop_continue} disabled={disabled} onChange={(e) => updateRow('enrollment_tracking_rows', i, { drop_continue: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    <option value="continue">Continue</option>
                    <option value="drop">Drop</option>
                  </select>
                  <input value={r.day1} placeholder="D1" disabled={disabled} onChange={(e) => updateRow('enrollment_tracking_rows', i, { day1: e.target.value })} className={inputCls} />
                  <RemoveBtn onClick={() => removeRow('enrollment_tracking_rows', i)} />
                </div>
              ))}
              <AddBtn onClick={() => addRow('enrollment_tracking_rows', emptyTrack)} />
              <TextLine label="Reason for drop" value={form.drop_reason_remarks} disabled={disabled} onChange={(v) => setForm((p) => ({ ...p, drop_reason_remarks: v }))} />
            </Section>

            {/* 9. Improvement Area */}
            <Section title="9. Improvement Area (Your & Team)">
              <textarea rows={4} value={form.improvement_area} disabled={disabled}
                onChange={(e) => setForm((p) => ({ ...p, improvement_area: e.target.value }))}
                className={cn(inputCls, 'w-full')} />
            </Section>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={disabled || subjectId == null}
            className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50 min-h-[44px]">
            {mut.isPending ? 'Saving…' : 'Save sheet'}
          </button>
          {mut.isSuccess ? <span className="text-sm text-emerald-600 dark:text-emerald-400/90">Saved.</span> : null}
          {mut.isError ? (
            <span className="text-sm text-destructive" role="alert">
              {mut.error instanceof Error ? mut.error.message : 'Save failed'}
            </span>
          ) : null}
        </div>
      </form>

      {compareQ.data ? <ComparePills week={compareQ.data.week} month={compareQ.data.month} /> : null}
      {trendsQ.isPending ? <Skeleton className="h-64 w-full rounded" /> : <GrowthTrio points={trendsQ.data?.points ?? []} />}
    </div>
  )
}

/* ── small building blocks ─────────────────────────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="surface-elevated space-y-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ds-label uppercase text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function NameList({ names, disabled, onChange, onAdd }: { names: string[]; disabled: boolean; onChange: (i: number, v: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-1.5">
      {names.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
          <input value={v} disabled={disabled} onChange={(e) => onChange(i, e.target.value)} className={cn(inputCls, 'w-full')} />
        </div>
      ))}
      <AddBtn onClick={onAdd} />
    </div>
  )
}

function PersonTable({ rows, disabled, onChange, onAdd, onRemove }: {
  rows: PersonRow[]; disabled: boolean
  onChange: (i: number, patch: Partial<PersonRow>) => void; onAdd: () => void; onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <RowHeader cols={['Name', 'CCs', 'Current State', 'Next Task', '']} grid="grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem]" />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-1.5">
          <input value={r.name} placeholder="Name" disabled={disabled} onChange={(e) => onChange(i, { name: e.target.value })} className={inputCls} />
          <input type="number" min={0} step="0.001" value={r.ccs} disabled={disabled} onChange={(e) => onChange(i, { ccs: Math.max(0, parseFloat(e.target.value) || 0) })} className={cn(inputCls, 'tabular-nums')} />
          <input value={r.current_state} placeholder="State" disabled={disabled} onChange={(e) => onChange(i, { current_state: e.target.value })} className={inputCls} />
          <input value={r.next_task} placeholder="Task" disabled={disabled} onChange={(e) => onChange(i, { next_task: e.target.value })} className={inputCls} />
          <RemoveBtn onClick={() => onRemove(i)} />
        </div>
      ))}
      <AddBtn onClick={onAdd} />
    </div>
  )
}

function RowHeader({ cols, grid }: { cols: string[]; grid: string }) {
  return (
    <div className={cn('hidden gap-1.5 text-[11px] text-muted-foreground sm:grid', grid)}>
      {cols.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  )
}

function CheckCell({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-center">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
    </label>
  )
}

function TextLine({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 pt-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'w-full')} />
    </label>
  )
}

function TotalChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      {label}: <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-xs text-primary hover:underline">+ add row</button>
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Remove row" className="text-muted-foreground hover:text-destructive">✕</button>
}

const MATCH_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  match: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Matches system' },
  partial: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Partly backed' },
  mismatch: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: "Doesn't match — flagged" },
  none: { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', label: 'Nothing claimed' },
}

/** Real system numbers + claimed-vs-actual match check ("sach ka aaina"). */
function MatchPanel({ actuals, match }: { actuals: Actuals; match: MatchInfo }) {
  const overall = MATCH_STYLE[match.overall] ?? MATCH_STYLE.none
  return (
    <div className="surface-elevated space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ds-label uppercase text-muted-foreground">Today's real activity (from system)</h2>
        <span className={cn('flex items-center gap-1.5 text-xs font-semibold', overall.text)}>
          <span className={cn('h-2 w-2 rounded-full', overall.dot)} />
          {overall.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Calls" value={String(actuals.calls)} accent />
        <Stat label="Leads added" value={String(actuals.leads_added)} />
        <Stat label="Follow-ups" value={String(actuals.followups)} />
      </div>
      <div className="space-y-1.5 border-t border-border/40 pt-2.5">
        {match.items.map((it) => {
          const st = MATCH_STYLE[it.status] ?? MATCH_STYLE.none
          return (
            <div key={it.metric} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', st.dot)} />
                <span className="text-foreground">{it.label}</span>
              </span>
              <span className="text-muted-foreground">
                you wrote <span className="font-semibold tabular-nums text-foreground">{it.claimed}</span> · system{' '}
                <span className="font-semibold tabular-nums text-foreground">{it.actual}</span>
              </span>
            </div>
          )
        })}
      </div>
      {match.flagged ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-600 dark:text-red-400">
          Flagged: what you wrote is more than the system shows. Admin can see this.
        </p>
      ) : null}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className={cn('text-lg font-bold tabular-nums', accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
