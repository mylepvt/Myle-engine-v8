import { cn } from '@/lib/utils'

// ── Shared sheet shape (mirrors GET /api/v1/current-cc/sheet) ───────────────
// Single source of truth for the Tracking Report sheet payload. The editable
// form (CurrentCcPage) imports these too so the read-only admin view and the
// form never drift apart.

export type PersonRow = { name: string; ccs: number; current_state: string; next_task: string }
export type EnrollmentRow = { name: string; fresh_lead: number; old_lead: number }
export type LeadCycleRow = { name: string; enrollment: number; budget_check: boolean; checked: boolean }
export type TrackingRow = { name: string; current_state: string; drop_continue: string; day1: string }

export type Actuals = { calls: number; leads_added: number; followups: number }
export type MatchItem = { metric: string; label: string; claimed: number; actual: number; status: string }
export type MatchInfo = { overall: string; flagged: boolean; items: MatchItem[] }

export type SheetPublic = {
  subject_user_id: number
  sheet_date: string
  actuals: Actuals
  match: MatchInfo
  target_ccs: number | null
  direct_persons: string[]
  direct_total_ccs: number | null
  real_active_persons: string[]
  light_active_persons: string[]
  closed_persons: PersonRow[]
  pending_persons: PersonRow[]
  enrollment_rows: EnrollmentRow[]
  lead_cycle_rows: LeadCycleRow[]
  lead_covered: string | null
  process_check: string | null
  enrollment_tracking_rows: TrackingRow[]
  drop_reason_remarks: string | null
  improvement_area: string | null
  closed_total_ccs: number
  current_ccs: number
  enrollment_total: number
}

/**
 * Read-only render of a member's submitted Tracking Report sheet — the exact
 * same sections the member fills in, shown to a leader/admin without any edit
 * controls. Layout follows the form (sections 1–9) so what the admin sees
 * matches what the member entered.
 */
export function SheetView({ sheet }: { sheet: SheetPublic }) {
  const closedTotal = sheet.closed_total_ccs ?? 0

  return (
    <div className="space-y-6">
      {/* Top totals — same chips the member sees above the form */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip label="Target CCs" value={sheet.target_ccs != null ? String(sheet.target_ccs) : '—'} />
        <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
          Current CCs:{' '}
          <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {closedTotal.toFixed(3)}
          </span>
        </span>
        <Chip label="Enrollment total" value={String(sheet.enrollment_total ?? 0)} />
      </div>

      <MatchPanel actuals={sheet.actuals} match={sheet.match} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* LEFT COLUMN — 1 to 5 */}
        <div className="space-y-6">
          <Section
            title="1. Direct Person's (Team)"
            right={<TotalChip label="Total CCs" value={sheet.direct_total_ccs ?? 0} />}
          >
            <NameList names={sheet.direct_persons} />
          </Section>

          <Section title="2. Real Active Person's (Team)">
            <NameList names={sheet.real_active_persons} />
          </Section>

          <Section title="3. Light Active Person (Team)">
            <NameList names={sheet.light_active_persons} />
          </Section>

          <Section
            title="4. Closed Person's List (CC Tracking)"
            right={<TotalChip label="Total CCs" value={Number(closedTotal.toFixed(3))} />}
          >
            <PersonTable rows={sheet.closed_persons} />
          </Section>

          <Section title="5. Pending Person CCs (Prospect)">
            <PersonTable rows={sheet.pending_persons} />
          </Section>
        </div>

        {/* RIGHT COLUMN — 6 to 9 */}
        <div className="space-y-6">
          <Section title="6. Enrollment (Prospect)" right={<TotalChip label="Total" value={sheet.enrollment_total ?? 0} />}>
            {sheet.enrollment_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <RowHeader cols={['Name', 'Fresh', 'Old', 'Total']} grid="grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem]" />
                {sheet.enrollment_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val className="tabular-nums">{r.fresh_lead}</Val>
                    <Val className="tabular-nums">{r.old_lead}</Val>
                    <span className="text-center text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {(r.fresh_lead || 0) + (r.old_lead || 0)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </Section>

          <Section title="7. Lead Cycle Daily (Team)">
            {sheet.lead_cycle_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <RowHeader cols={['Name', 'Enroll', 'Budget', 'Check']} grid="grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem]" />
                {sheet.lead_cycle_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val className="tabular-nums">{r.enrollment}</Val>
                    <CheckMark on={r.budget_check} />
                    <CheckMark on={r.checked} />
                  </div>
                ))}
              </>
            )}
            <ReadLine label="Lead Covered" value={sheet.lead_covered} />
            <ReadLine label="Process Check" value={sheet.process_check} />
          </Section>

          <Section title="8. Enrollment Tracking (Prospect)">
            {sheet.enrollment_tracking_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <RowHeader cols={['Name', 'State', 'Drop/Cont', 'Day-1']} grid="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem]" />
                {sheet.enrollment_tracking_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val>{r.current_state}</Val>
                    <Val className="capitalize">{r.drop_continue || '—'}</Val>
                    <Val>{r.day1}</Val>
                  </div>
                ))}
              </>
            )}
            <ReadLine label="Reason for drop" value={sheet.drop_reason_remarks} />
          </Section>

          <Section title="9. Improvement Area (Your & Team)">
            {sheet.improvement_area ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{sheet.improvement_area}</p>
            ) : (
              <Empty />
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

/* ── building blocks ───────────────────────────────────────────────────── */

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

function NameList({ names }: { names: string[] }) {
  const filled = names.filter((n) => n && n.trim())
  if (filled.length === 0) return <Empty />
  return (
    <div className="space-y-1.5">
      {filled.map((v, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
          <span className="text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )
}

function PersonTable({ rows }: { rows: PersonRow[] }) {
  const filled = rows.filter((r) => (r.name && r.name.trim()) || r.ccs)
  if (filled.length === 0) return <Empty />
  return (
    <div className="space-y-1.5">
      <RowHeader cols={['Name', 'CCs', 'Current State', 'Next Task']} grid="grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_minmax(0,1fr)]" />
      {filled.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 text-sm">
          <Val>{r.name}</Val>
          <Val className="tabular-nums">{r.ccs}</Val>
          <Val>{r.current_state}</Val>
          <Val>{r.next_task}</Val>
        </div>
      ))}
    </div>
  )
}

function RowHeader({ cols, grid }: { cols: string[]; grid: string }) {
  return (
    <div className={cn('hidden gap-1.5 text-[11px] text-muted-foreground sm:grid', grid)}>
      {cols.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  )
}

function Val({ children, className }: { children: React.ReactNode; className?: string }) {
  const empty = children == null || children === ''
  return (
    <span className={cn('truncate text-foreground', empty && 'text-muted-foreground/50', className)}>
      {empty ? '—' : children}
    </span>
  )
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <span className={cn('text-center text-sm', on ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40')}>
      {on ? '✓' : '—'}
    </span>
  )
}

function ReadLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2 pt-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className={cn('text-foreground', !value && 'text-muted-foreground/50')}>{value || '—'}</span>
    </div>
  )
}

function TotalChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      {label}: <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      {label}: <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

function Empty() {
  return <p className="text-sm text-muted-foreground/60">— Kuch nahi bhara —</p>
}

const MATCH_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  match: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Matches system' },
  partial: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Partly backed' },
  mismatch: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: "Doesn't match — flagged" },
  none: { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', label: 'Nothing claimed' },
}

/** Real system numbers + claimed-vs-actual check — same panel the member sees. */
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
      {match.items.length > 0 ? (
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
                  wrote <span className="font-semibold tabular-nums text-foreground">{it.claimed}</span> · system{' '}
                  <span className="font-semibold tabular-nums text-foreground">{it.actual}</span>
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      {match.flagged ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-600 dark:text-red-400">
          Flagged: member wrote more than the system shows.
        </p>
      ) : null}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className={cn('text-lg font-bold tabular-nums', accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
