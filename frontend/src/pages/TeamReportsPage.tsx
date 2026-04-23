import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type TeamReportItem,
  type TeamReportsLiveSummary,
  useTeamReportsQuery,
} from '@/hooks/use-team-reports-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  if (role === 'leader') return 'Leader'
  if (role === 'team') return 'Member'
  return role
}

function roleBadgeVariant(role: string): 'warning' | 'primary' | 'success' | 'outline' {
  if (role === 'admin') return 'warning'
  if (role === 'leader') return 'primary'
  if (role === 'team') return 'success'
  return 'outline'
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="surface-elevated rounded-xl px-4 py-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ReportMetric({
  reported,
  system,
  tone,
}: {
  reported: number
  system: number
  tone: string
}) {
  const showSystem = system > 0 || system !== reported
  const mismatch = showSystem && system !== reported

  return (
    <div className="text-center">
      <div className={cn('text-sm font-semibold tabular-nums', tone)}>{reported}</div>
      {showSystem ? (
        <div className={cn('text-[0.68rem] tabular-nums', mismatch ? 'text-amber-400' : 'text-muted-foreground')}>
          sys {system}
        </div>
      ) : null}
    </div>
  )
}

function SubmissionCard({ item }: { item: TeamReportItem }) {
  const mismatch =
    item.calls_made_actual !== item.total_calling || item.payments_actual !== item.enrollments_done

  return (
    <article className="surface-elevated rounded-xl p-4 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-foreground">{item.member_name}</p>
            <Badge variant={roleBadgeVariant(item.member_role)}>{roleLabel(item.member_role)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.member_fbo_id}
            {item.member_phone ? ` · ${item.member_phone}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{item.member_email}</p>
        </div>

        <Badge variant={mismatch ? 'warning' : item.system_verified ? 'success' : 'outline'}>
          {mismatch ? 'Mismatch' : item.system_verified ? 'Verified' : 'Manual'}
        </Badge>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Submitted {formatDateTime(item.submitted_at)}</p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="surface-inset rounded-lg px-2 py-2">
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Calls</p>
          <ReportMetric reported={item.total_calling} system={item.calls_made_actual} tone="text-primary" />
        </div>
        <div className="surface-inset rounded-lg px-2 py-2">
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Picked</p>
          <div className="text-center text-sm font-semibold tabular-nums text-emerald-300">{item.calls_picked}</div>
        </div>
        <div className="surface-inset rounded-lg px-2 py-2">
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Enroll</p>
          <ReportMetric reported={item.enrollments_done} system={item.payments_actual} tone="text-amber-300" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] text-muted-foreground">
        <span className="rounded-full border border-white/10 px-2 py-1">Pending {item.pending_enroll}</span>
        <span className="rounded-full border border-white/10 px-2 py-1">2CC {item.plan_2cc}</span>
        <span className="rounded-full border border-white/10 px-2 py-1">Seat {item.seat_holdings}</span>
      </div>

      {item.remarks ? <p className="mt-3 text-sm text-muted-foreground">{item.remarks}</p> : null}
    </article>
  )
}

const TILES: { key: keyof TeamReportsLiveSummary; label: string; color: string }[] = [
  { key: 'leads_claimed_today', label: 'Claimed (day)', color: 'text-primary' },
  { key: 'calls_made_today', label: 'Calls (day)', color: 'text-emerald-400' },
  { key: 'enrolled_today', label: 'Proof uploaded (day)', color: 'text-amber-400' },
  {
    key: 'payment_proofs_approved_today',
    label: '₹196 proof approved (day)',
    color: 'text-teal-400',
  },
  { key: 'day1_total', label: 'In Day 1', color: 'text-sky-400' },
  { key: 'day2_total', label: 'In Day 2', color: 'text-violet-400' },
  { key: 'converted_total', label: 'Converted', color: 'text-muted-foreground' },
]

export function TeamReportsPage({ title }: Props) {
  const [dateIso, setDateIso] = useState(todayIsoLocal)
  const { data, isPending, isError, error, refetch } = useTeamReportsQuery(dateIso)

  const summary = useMemo(() => {
    const items = data?.items ?? []
    return {
      submitted: data?.total ?? 0,
      scopeTotal: data?.scope_total_members ?? 0,
      missing: data?.missing_members.length ?? 0,
      totalCalls: items.reduce((sum, item) => sum + item.total_calling, 0),
      totalEnrollments: items.reduce((sum, item) => sum + item.enrollments_done, 0),
    }
  }, [data])

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Date-wise submitted team reports with member details, submission time, and missing follow-up list.
          Live tiles use the same scoped members for the selected day.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground"
          />
        </label>
        <span className="text-xs text-muted-foreground">
          Reporting day: <span className="text-foreground">{data?.date ?? dateIso}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Timezone: <span className="text-foreground">{data?.timezone ?? 'Asia/Kolkata'}</span>
        </span>
      </div>

      {isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Members in scope"
              value={summary.scopeTotal}
              hint="Org-tree scoped members for this report view."
            />
            <MetricCard
              label="Submitted"
              value={summary.submitted}
              hint={summary.scopeTotal > 0 ? `${summary.scopeTotal - summary.submitted} still pending.` : 'No members in scope.'}
            />
            <MetricCard
              label="Missing"
              value={summary.missing}
              hint="Members who have not submitted for the selected date."
            />
            <MetricCard
              label="Reported calls"
              value={summary.totalCalls}
              hint={`${summary.totalEnrollments} enrollments reported in submitted rows.`}
            />
          </div>

          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Live data (from system)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {TILES.map((tile) => (
                <div
                  key={tile.key}
                  className="surface-elevated rounded-xl border border-white/[0.08] py-3 text-center"
                >
                  <div className={cn('text-2xl font-bold tabular-nums', tile.color)}>
                    {data.live_summary[tile.key]}
                  </div>
                  <div className="mt-1 px-1 text-[0.62rem] text-muted-foreground">{tile.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
            <section className="surface-elevated p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Submitted reports</p>
                  <p className="text-xs text-muted-foreground">
                    Latest submissions first, including member details and manual vs system counts.
                  </p>
                </div>
                <Badge variant="outline">{data.total} rows</Badge>
              </div>

              {data.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-sm text-muted-foreground">
                  No reports submitted for {data.date}.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {data.items.map((item) => (
                      <SubmissionCard key={item.report_id} item={item} />
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr className="border-b border-white/10">
                          <th className="pb-3 pr-4 font-medium">Member</th>
                          <th className="pb-3 pr-4 font-medium">Submitted</th>
                          <th className="pb-3 px-3 font-medium text-center">Calls</th>
                          <th className="pb-3 px-3 font-medium text-center">Picked</th>
                          <th className="pb-3 px-3 font-medium text-center">Enroll</th>
                          <th className="pb-3 px-3 font-medium text-center">Pending</th>
                          <th className="pb-3 px-3 font-medium text-center">2CC</th>
                          <th className="pb-3 pl-4 font-medium">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((item) => {
                          const mismatch =
                            item.calls_made_actual !== item.total_calling ||
                            item.payments_actual !== item.enrollments_done

                          return (
                            <tr key={item.report_id} className="border-b border-white/[0.06] align-top">
                              <td className="py-4 pr-4">
                                <div className="min-w-[15rem]">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-foreground">{item.member_name}</p>
                                    <Badge variant={roleBadgeVariant(item.member_role)}>
                                      {roleLabel(item.member_role)}
                                    </Badge>
                                    <Badge
                                      variant={mismatch ? 'warning' : item.system_verified ? 'success' : 'outline'}
                                    >
                                      {mismatch ? 'Mismatch' : item.system_verified ? 'Verified' : 'Manual'}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {item.member_fbo_id}
                                    {item.member_phone ? ` · ${item.member_phone}` : ''}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">{item.member_email}</p>
                                </div>
                              </td>
                              <td className="py-4 pr-4 text-xs text-muted-foreground">
                                {formatDateTime(item.submitted_at)}
                              </td>
                              <td className="py-4 px-3">
                                <ReportMetric
                                  reported={item.total_calling}
                                  system={item.calls_made_actual}
                                  tone="text-primary"
                                />
                              </td>
                              <td className="py-4 px-3 text-center">
                                <span className="text-sm font-semibold tabular-nums text-emerald-300">
                                  {item.calls_picked}
                                </span>
                              </td>
                              <td className="py-4 px-3">
                                <ReportMetric
                                  reported={item.enrollments_done}
                                  system={item.payments_actual}
                                  tone="text-amber-300"
                                />
                              </td>
                              <td className="py-4 px-3 text-center">
                                <span className="text-sm font-semibold tabular-nums text-foreground">
                                  {item.pending_enroll}
                                </span>
                              </td>
                              <td className="py-4 px-3 text-center">
                                <span className="text-sm font-semibold tabular-nums text-violet-300">
                                  {item.plan_2cc}
                                </span>
                              </td>
                              <td className="py-4 pl-4 text-sm text-muted-foreground">
                                {item.remarks ? item.remarks : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="surface-elevated p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Missing members</p>
                  <p className="text-xs text-muted-foreground">
                    People in the same scoped branch who have not submitted yet.
                  </p>
                </div>
                <Badge variant={data.missing_members.length > 0 ? 'warning' : 'success'}>
                  {data.missing_members.length}
                </Badge>
              </div>

              {data.missing_members.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-sm text-muted-foreground">
                  Everyone in scope has submitted for {data.date}.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.missing_members.map((member) => (
                    <div key={member.user_id} className="surface-inset rounded-xl px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-foreground">{member.member_name}</p>
                            <Badge variant={roleBadgeVariant(member.member_role)}>
                              {roleLabel(member.member_role)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {member.member_fbo_id}
                            {member.member_phone ? ` · ${member.member_phone}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{member.member_email}</p>
                          {member.upline_name ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Reports to {member.upline_name}
                              {member.upline_fbo_id ? ` (${member.upline_fbo_id})` : ''}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant="outline">Pending</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {data.note ? <p className="text-xs leading-relaxed text-muted-foreground">{data.note}</p> : null}
        </>
      ) : null}
    </div>
  )
}
