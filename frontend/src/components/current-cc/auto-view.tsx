import { cn } from '@/lib/utils'
import type {
  Actuals,
  EnrollmentRow,
  LeadCycleRow,
  PersonRow,
  TrackingRow,
} from '@/components/current-cc/sheet-view'

// ── System-computed Tracking Report (mirrors GET /api/v1/current-cc/auto) ────
export type AutoReport = {
  subject_user_id: number
  sheet_date: string
  direct_persons: string[]
  direct_count: number
  recruitment_low: boolean
  real_active_persons: string[]
  light_active_persons: string[]
  closed_persons: PersonRow[]
  closed_total_ccs: number
  pending_persons: PersonRow[]
  enrollment_rows: EnrollmentRow[]
  enrollment_total: number
  enrollment_split_approx: boolean
  lead_cycle_rows: LeadCycleRow[]
  lead_covered: string | null
  enrollment_tracking_rows: TrackingRow[]
  drop_reason_remarks: string | null
  actuals: Actuals
  activity_breakdown: ActivityBreakdown
}

export type ActivityBreakdown = {
  leads_created: number
  leads_uploaded: number
  leads_claimed: number
  calls_total: number
  retarget_calls: number
}

/**
 * Read-only "what the system already knows" panel. Shown next to the member's
 * submitted sheet so admin/leader can compare system-computed vs member-wrote,
 * and used to prefill the form. Everything here is derived from real data —
 * only Process Check and Improvement Area stay manual (the leader's judgement).
 */
export function AutoView({ auto }: { auto: AutoReport }) {
  return (
    <div className="surface-elevated space-y-5 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ds-label uppercase text-muted-foreground">
          System computed <span className="text-primary">· auto from data</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip label="Current CCs" value={auto.closed_total_ccs.toFixed(3)} accent />
          <Chip label="Enrollment" value={String(auto.enrollment_total)} />
          <Chip label="Direct team" value={String(auto.direct_count)} />
        </div>
      </div>

      {auto.recruitment_low ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Direct team chhota hai ({auto.direct_count}) — front recruitment badhane ki zarurat.
        </p>
      ) : null}

      {/* Exact counts from app logs (activity_log + call_events) — cannot be inflated. */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase text-muted-foreground">
          Aaj ka actual kaam (app logs se ginaa — claim nahi)
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Metric label="Leads created" value={auto.activity_breakdown.leads_created} />
          <Metric label="Uploaded" value={auto.activity_breakdown.leads_uploaded} />
          <Metric label="Claimed" value={auto.activity_breakdown.leads_claimed} />
          <Metric label="Calls" value={auto.activity_breakdown.calls_total} accent />
          <Metric label="Retarget calls" value={auto.activity_breakdown.retarget_calls} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <Section title="1. Direct Person's (Team)">
            <NameList names={auto.direct_persons} />
          </Section>
          <Section title="2. Real Active Person's (Team)">
            <NameList names={auto.real_active_persons} />
          </Section>
          <Section title="3. Light Active Person (Team)">
            <NameList names={auto.light_active_persons} />
          </Section>
          <Section title="4. Closed Person's (CC Tracking)" right={<Total label="CCs" value={auto.closed_total_ccs} />}>
            <PersonRows rows={auto.closed_persons} />
          </Section>
          <Section title="5. Pending Person CCs">
            <PersonRows rows={auto.pending_persons} />
          </Section>
        </div>

        <div className="space-y-5">
          <Section
            title="6. Enrollment"
            right={<Total label="Total" value={auto.enrollment_total} />}
          >
            {auto.enrollment_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <Head cols={['Name', 'Fresh', 'Old', 'Total']} grid="grid-cols-[minmax(0,1fr)_3rem_3rem_3rem]" />
                {auto.enrollment_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val className="tabular-nums">{r.fresh_lead}</Val>
                    <Val className="tabular-nums">{r.old_lead}</Val>
                    <span className="text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {(r.fresh_lead || 0) + (r.old_lead || 0)}
                    </span>
                  </div>
                ))}
                {auto.enrollment_split_approx ? (
                  <p className="text-[11px] text-muted-foreground/70">Fresh/old split approximate (phone match).</p>
                ) : null}
              </>
            )}
          </Section>

          <Section title="7. Lead Cycle (budget)">
            {auto.lead_cycle_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <Head cols={['Name', 'Enroll', 'Budget', 'Check']} grid="grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem]" />
                {auto.lead_cycle_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val className="tabular-nums">{r.enrollment}</Val>
                    <Check on={r.budget_check} />
                    <Check on={r.checked} />
                  </div>
                ))}
              </>
            )}
            <ReadLine label="Lead Covered" value={auto.lead_covered} />
          </Section>

          <Section title="8. Enrollment Tracking">
            {auto.enrollment_tracking_rows.length === 0 ? (
              <Empty />
            ) : (
              <>
                <Head cols={['Name', 'State', 'Drop/Cont', 'Day-1']} grid="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem]" />
                {auto.enrollment_tracking_rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_3rem] items-center gap-1.5 text-sm">
                    <Val>{r.name}</Val>
                    <Val>{r.current_state}</Val>
                    <Val className="capitalize">{r.drop_continue || '—'}</Val>
                    <Val>{r.day1 || '—'}</Val>
                  </div>
                ))}
              </>
            )}
            <ReadLine label="Reason for drop" value={auto.drop_reason_remarks} />
          </Section>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Process Check &amp; Improvement Area system se nahi aate — wo leader khud bharta hai.
      </p>
    </div>
  )
}

/* ── building blocks ───────────────────────────────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase text-muted-foreground">{title}</h3>
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
    <div className="space-y-1">
      {filled.map((v, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
          <span className="text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )
}

function PersonRows({ rows }: { rows: PersonRow[] }) {
  const filled = rows.filter((r) => (r.name && r.name.trim()) || r.ccs)
  if (filled.length === 0) return <Empty />
  return (
    <div className="space-y-1">
      <Head cols={['Name', 'CCs', 'State']} grid="grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]" />
      {filled.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-1.5 text-sm">
          <Val>{r.name}</Val>
          <Val className="tabular-nums">{r.ccs || '—'}</Val>
          <Val>{r.current_state}</Val>
        </div>
      ))}
    </div>
  )
}

function Head({ cols, grid }: { cols: string[]; grid: string }) {
  return (
    <div className={cn('hidden gap-1.5 text-[10px] text-muted-foreground sm:grid', grid)}>
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

function Check({ on }: { on: boolean }) {
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

function Total({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[11px] text-muted-foreground">
      {label}: <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  )
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
      {label}:{' '}
      <span className={cn('font-semibold tabular-nums', accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
        {value}
      </span>
    </span>
  )
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-center">
      <p className={cn('text-lg font-bold tabular-nums', accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
        {value}
      </p>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-muted-foreground/60">— System mein kuch nahi —</p>
}
