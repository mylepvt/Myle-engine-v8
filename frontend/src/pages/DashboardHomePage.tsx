import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardCheck, Layers, TrendingUp, UserPlus, Users, Zap } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { XpBadge } from '@/components/xp/XpBadge'
import { XpLeaderboard } from '@/components/xp/XpLeaderboard'
import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { AdminCommandCenter } from '@/components/dashboard/AdminCommandCenter'
import { CcSummaryCard } from '@/components/dashboard/CcSummaryCard'
import { TeamDashboardHomeModern } from '@/components/dashboard/TeamDashboardHomeModern'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, LoadingState } from '@/components/ui/states'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getHomeQuickActions } from '@/config/dashboard-home-actions'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useFollowUpsQuery } from '@/hooks/use-follow-ups-query'
import { useTeamPersonalFunnelQuery } from '@/hooks/use-team-personal-funnel-query'
import { useHandedOffLeadsQuery } from '@/hooks/use-handed-off-leads-query'
import { useTeamTodayStatsQuery } from '@/hooks/use-team-today-stats-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { LEAD_STATUS_OPTIONS, type LeadPublic, type LeadStatus, usePatchLeadMutation } from '@/hooks/use-leads-query'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { usePingLoginMutation } from '@/hooks/use-xp-query'
import { useLosQuery } from '@/hooks/use-los-query'
import { VerificationHomePanel } from '@/components/dashboard/VerificationHomePanel'
import { CampaignProgressCard } from '@/components/dashboard/CampaignProgressCard'
import { useLeaderCommandCenter } from '@/hooks/use-leader-command-center-query'
import { MissionHomePanel } from '@/components/dashboard/MissionHomePanel'
import { cn } from '@/lib/utils'

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border/40 pt-4 mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  )
}

/** Canonical stage labels — same source as leads/workboard (legacy parity; all roles). */
function statusLabel(status: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

function recentFromWorkboard(columns: { items?: LeadPublic[] }[] | undefined): LeadPublic[] {
  if (!columns?.length) return []
  const seen = new Set<number>()
  const out: LeadPublic[] = []
  for (const col of columns) {
    const rowItems = col.items ?? []
    for (const item of rowItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        out.push(item)
      }
    }
  }
  return out
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 8)
}

const D1_STAGES = ['invited', 'whatsapp_sent', 'video_watched', 'paid'] as const

function Day1PipelineRow({
  lead,
  onPatch,
  patching,
}: {
  lead: LeadPublic
  onPatch: (id: number, body: { d1_morning?: boolean; d1_afternoon?: boolean; d1_evening?: boolean; status?: LeadStatus }) => void
  patching: boolean
}) {
  const allDone = lead.d1_morning && lead.d1_afternoon && lead.d1_evening
  const day1Complete = Boolean(lead.day1_completed_at) || allDone

  return (
    <TableRow className="bg-primary/[0.06] hover:bg-primary/[0.10]">
      <TableCell colSpan={4} className="py-2 px-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Previous stages auto-complete */}
          <div className="flex items-center gap-1">
            {D1_STAGES.map((s) => (
              <span key={s} className="flex items-center gap-0.5 text-[0.7rem] text-emerald-600/80 dark:text-emerald-400/80">
                <CheckCircle2 className="size-3.5" />
              </span>
            ))}
            <span className="ml-1 text-ds-caption text-muted-foreground">Pre-Day 1 ✓</span>
          </div>

          <span className="text-muted-foreground/40">|</span>

          {/* Day 1 batch slots */}
          <div className="flex items-center gap-2">
            {(['d1_morning', 'd1_afternoon', 'd1_evening'] as const).map((slot, i) => {
              const labels = ['M', 'A', 'E']
              const checked = lead[slot]
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={patching}
                  onClick={() => onPatch(lead.id, { [slot]: !checked })}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium transition disabled:opacity-50',
                    checked
                      ? 'border-emerald-600/40 bg-emerald-600/12 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-400/12 dark:text-emerald-400'
                      : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {checked ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                  {labels[i]}
                </button>
              )
            })}
          </div>

          {/* Push to Day 2 */}
          {day1Complete && (
            <Button
              size="sm"
              variant="default"
              disabled={patching}
              className="h-9 px-3 text-ds-caption bg-primary/90 hover:bg-primary"
              onClick={() => onPatch(lead.id, { status: 'day2' as LeadStatus })}
            >
              Push to Day 2 →
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function WarRoomDashboard({
  los,
  lcc,
  wb,
}: {
  los: ReturnType<typeof useLosQuery>
  lcc: ReturnType<typeof useLeaderCommandCenter>
  wb: ReturnType<typeof useWorkboardQuery>
}) {
  const isLoading = los.isPending && !los.data
  const isError = los.isError && !los.data

  const pipelineColumns = useMemo(() => {
    const colMap = new Map<string, number>()
    for (const col of wb.data?.columns ?? []) {
      colMap.set(col.status, col.total)
    }
    const maxCount = Math.max(1, ...Array.from(colMap.values()))
    const stages = [
      {
        title: 'Top of Funnel',
        color: '#818cf8',
        stages: [
          { key: 'new_lead', label: 'Just Claimed', color: '#818cf8' },
          { key: 'contacted', label: 'Contacted', color: '#60a5fa' },
          { key: 'invited', label: 'Invited', color: '#38bdf8' },
        ],
      },
      {
        title: 'Engagement',
        color: '#22d3ee',
        stages: [
          { key: 'whatsapp_sent', label: 'WhatsApp Sent', color: '#22d3ee' },
          { key: 'video_watched', label: 'Video Watched', color: '#6ee7b7' },
          { key: 'paid', label: 'Paid', color: '#a3e635' },
          { key: 'day1', label: 'Day 1', color: '#84cc16' },
        ],
      },
      {
        title: 'Conversion',
        color: '#f43f5e',
        stages: [
          { key: 'day2', label: 'Day 2', color: '#eab308' },
          { key: 'day3', label: 'Day 3', color: '#fb923c' },
          { key: 'day4', label: 'Day 4', color: '#f97316' },
          { key: 'day5', label: 'Day 5', color: '#ef4444' },
          { key: 'converted', label: 'Converted', color: '#f43f5e' },
        ],
      },
    ]
    return { stages, maxCount, colMap }
  }, [wb.data])

  const { stages: pipelineStageDefs, maxCount: pipelineMaxCount, colMap: pipelineColMap } = pipelineColumns

  const pipelineTotal = useMemo(
    () => pipelineStageDefs.reduce((sum, col) => sum + col.stages.reduce((s, st) => s + (pipelineColMap.get(st.key) ?? 0), 0), 0),
    [pipelineStageDefs, pipelineColMap],
  )

  const navigate = useNavigate()
  const [showAllActions, setShowAllActions] = useState(false)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError || !los.data) {
    return (
      <ErrorState
        message="Could not load team data."
        onRetry={() => {
          los.refetch()
          lcc.refetch()
        }}
      />
    )
  }

  const s = los.data
  const h = lcc.data?.team_health
  const f = lcc.data?.fires
  const actions = lcc.data?.actions ?? []
  const totalCritical = actions.filter((a) => a.severity === 'critical').length
  const displayedActions = showAllActions ? actions : actions.slice(0, 3)

  return (
    <div className="space-y-5">
      {/* ── Pipeline Board ─────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden />
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <h3 className="text-sm font-bold">Pipeline Board</h3>
          </div>
          <Link
            to="/dashboard/work/workboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open board <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {pipelineTotal === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No leads in pipeline.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {pipelineStageDefs.map((col) => {
              const colTotal = col.stages.reduce((s, st) => s + (pipelineColMap.get(st.key) ?? 0), 0)
              return (
                <div key={col.title} className="rounded-xl border border-border/40 bg-card p-4 transition-colors hover:border-border/60">
                  <div className="mb-3 flex items-center justify-between border-b border-border/30 pb-2.5" style={{ borderColor: `${col.color}30` }}>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: col.color }}>
                      {col.title}
                    </span>
                    <span className="inline-flex items-center gap-1 text-lg font-extrabold tabular-nums" style={{ color: col.color }}>
                      {colTotal}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {col.stages.map((stage) => {
                      const count = pipelineColMap.get(stage.key) ?? 0
                      const pct = pipelineMaxCount > 0 ? Math.max(3, (count / pipelineMaxCount) * 100) : 0
                      const sharePct = pipelineTotal > 0 ? Math.round((count / pipelineTotal) * 100) : 0
                      return (
                        <div
                          key={stage.key}
                          className="block rounded-lg border border-border/30 bg-background/40 p-3 transition-all hover:border-border/60 hover:bg-muted/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: stage.color, boxShadow: `0 0 0 1px ${stage.color}40` }}
                              />
                              <span className="truncate text-[13px] font-medium text-muted-foreground">
                                {stage.label}
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 shrink-0 text-base font-extrabold tabular-nums" style={{ color: stage.color }}>
                              {count}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, backgroundColor: stage.color }}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground/60 tabular-nums">
                              {sharePct}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Priority Matrix + Team Health ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Zap className="size-4 text-amber-500" />
              Priority Matrix
            </h3>
            {totalCritical > 0 && (
              <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-500">{totalCritical} urgent</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center">
              <p className="text-2xl font-extrabold tabular-nums text-red-500">{f?.campaign_failures ?? '—'}</p>
              <p className="mt-1 text-xs text-red-400">Missed Missions</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
              <p className="text-2xl font-extrabold tabular-nums text-amber-500">{f?.zombie_leads ?? '—'}</p>
              <p className="mt-1 text-xs text-amber-400">Zombie Leads</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-center">
              <p className="text-2xl font-extrabold tabular-nums text-blue-500">{f?.pending_verifications ?? '—'}</p>
              <p className="mt-1 text-xs text-blue-400">Pending Verif.</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
              <p className="text-2xl font-extrabold tabular-nums text-emerald-500">{f?.campaigns_running ?? '—'}</p>
              <p className="mt-1 text-xs text-emerald-400">Campaigns Running</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <TrendingUp className="size-4 text-emerald-500" />
              Team Health
            </h3>
            {h && (
              <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', h.leader_band === 'elite' ? 'bg-emerald-500/15 text-emerald-500' : h.leader_band === 'average' ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500')}>
                Score: {h.leader_score}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {h ? (
              <>
                {[
                  { label: 'Mission', value: h.mission_completion_pct, color: 'bg-emerald-500' },
                  { label: 'Verification', value: h.verification_pct, color: 'bg-amber-500' },
                  { label: 'Conversion', value: h.conversion_pct, color: 'bg-red-500' },
                  { label: 'Zombie Score', value: h.zombie_score, color: 'bg-amber-500' },
                  { label: 'Blocker Res.', value: h.blocker_resolution_pct, color: 'bg-emerald-500' },
                ].map((item) => {
                  const textColor = item.value >= 70 ? 'text-emerald-500' : item.value >= 40 ? 'text-amber-500' : 'text-red-500'
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{item.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', item.color)} style={{ width: `${Math.min(100, item.value)}%` }} />
                      </div>
                      <span className={cn('w-8 shrink-0 text-right text-xs font-bold tabular-nums', textColor)}>
                        {Math.round(item.value)}
                      </span>
                    </div>
                  )
                })}
                {(f?.blockers_waiting ?? 0) > 0 && (
                  <p className="pt-1 text-[11px] text-muted-foreground">{f?.blockers_waiting} blocker(s) currently unresolved.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading health data…</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Team Members + Action Queue ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Users className="size-4 text-blue-500" />
              Team Members
            </h3>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {s.total_members} total
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {s.members.slice(0, 8).map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs font-medium">
                <span className={cn('size-2 shrink-0 rounded-full', m.is_active ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="truncate">{m.name}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">{m.calls_today}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle className="size-4 text-amber-500" />
              Action Queue
            </h3>
            {actions.length > 0 && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{actions.length} items</span>
            )}
          </div>
          {actions.length > 0 ? (
            <>
              <div className="space-y-2">
                {displayedActions.map((a, i) => {
                  const severityDot = a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                  const btnStyle = a.action_type === 'call'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : a.action_type === 'message'
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  const btnLabel = a.action_type === 'call' ? 'Call'
                    : a.action_type === 'message' ? 'Message'
                    : a.action_type === 'review' ? 'Review'
                    : a.action_type === 'verify' ? 'Verify'
                    : a.action_type === 'follow_up' ? 'Follow Up'
                    : 'Action'
                  return (
                    <div key={`${a.member_id}-${i}`} className={cn(
                      'flex items-center gap-3 rounded-xl border p-3',
                      a.severity === 'critical' ? 'border-red-500/20 bg-red-500/5' :
                      a.severity === 'warning' ? 'border-amber-500/20 bg-amber-500/5' :
                      'border-blue-500/20 bg-blue-500/5',
                    )}>
                      <span className={cn('size-2 shrink-0 rounded-full', severityDot)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{a.member_name}</p>
                        <p className="text-xs text-muted-foreground">{a.issue}</p>
                      </div>
                      <button
                        type="button"
                        className={cn('shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold', btnStyle)}
                        onClick={() => navigate(a.action_ref || `/dashboard/team/tracking/${a.member_id}`)}
                      >
                        {btnLabel}
                      </button>
                    </div>
                  )
                })}
              </div>
              {actions.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllActions((o) => !o)}
                  className="mt-2 w-full rounded-lg border border-border/40 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  {showAllActions ? 'Show less' : `Show all ${actions.length} items`}
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-5">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              <p className="text-sm font-bold text-emerald-500">All Clear!</p>
              <p className="text-xs text-muted-foreground">No actions needed right now.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DashboardHomePage() {
  const { role } = useDashboardShellRole()
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const sessionReady = Boolean(me?.authenticated)
  const patchLead = usePatchLeadMutation()

  const wb = useWorkboardQuery(sessionReady)
  /** Legacy team dashboard had no follow-up queue in nav; skip API for team. */
  const fu = useFollowUpsQuery(true, sessionReady && role !== 'team')
  const teamFunnel = useTeamPersonalFunnelQuery(sessionReady && role === 'team')
  const teamToday = useTeamTodayStatsQuery(sessionReady && role === 'team')
  const handedOffLeads = useHandedOffLeadsQuery(sessionReady && role === 'team')
  const pool = useLeadPoolQuery(sessionReady && role === 'admin')
  const adminReports = useTeamReportsQuery('', sessionReady && role === 'admin')
  const los = useLosQuery(sessionReady && role === 'leader')
  const lcc = useLeaderCommandCenter(sessionReady && role === 'leader')
  const pingLogin = usePingLoginMutation()

  useEffect(() => {
    if (sessionReady) {
      pingLogin.mutate()
    }
    // fire once on mount when session is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady])

  const firstName =
    (me?.username?.trim() && me.username.split(/\s+/)[0]) ||
    me?.fbo_id ||
    me?.email?.split('@')[0]?.split(/[._-]/)[0] ||
    'there'

  const metrics = useMemo(() => {
    const columns = wb.data?.columns
    if (!columns) {
      return {
        activeTotal: 0,
        won: 0,
        lost: 0,
        newLeads: 0,
        winRatePct: null as number | null,
        chartMax: 1,
        bars: [] as { status: string; total: number; label: string }[],
      }
    }
    let activeTotal = 0
    let won = 0
    let lost = 0
    let newLeads = 0
    const bars: { status: string; total: number; label: string }[] = []
    for (const c of columns) {
      const t = typeof c.total === 'number' ? c.total : 0
      activeTotal += t
      if (c.status === 'converted') won = t
      if (c.status === 'lost') lost = t
      if (c.status === 'new_lead' || c.status === 'new') newLeads = t
      bars.push({
        status: c.status,
        total: t,
        label: statusLabel(c.status),
      })
    }
    const closed = won + lost
    const winRatePct = closed > 0 ? Math.round((won / closed) * 100) : null
    const chartMax = Math.max(...bars.map((b) => b.total), 1)
    return {
      activeTotal,
      won,
      lost,
      newLeads,
      winRatePct,
      chartMax,
      bars,
    }
  }, [wb.data?.columns])

  const recentLeads = useMemo(
    () => recentFromWorkboard(wb.data?.columns),
    [wb.data?.columns],
  )

  const openFollowUps = fu.data?.total ?? 0
  const poolTotal = pool.data?.total ?? 0

  const kpiLoading =
    sessionReady &&
    (wb.isPending ||
      (role !== 'team' && fu.isPending) ||
      (role === 'team' && teamFunnel.isPending))

  const quickActions = useMemo(() => {
    if (role == null) return []
    return getHomeQuickActions(role, { poolTotal })
  }, [role, poolTotal])

  if (role === 'team' && sessionReady) {
    return (
      <TeamDashboardHomeModern
        sessionReady={sessionReady}
        firstName={firstName}
        funnel={teamFunnel.data}
        today={teamToday.data}
        recentLeads={recentLeads}
        handedOffLeads={handedOffLeads.data ?? []}
        handedOffPending={handedOffLeads.isPending}
        quickActions={quickActions}
      />
    )
  }

  if (role === 'admin' && sessionReady) {
    return <AdminCommandCenter firstName={firstName} />
  }

  return (
    <div className={cn('mx-auto space-y-4 md:space-y-6', role === 'leader' ? 'max-w-7xl' : 'max-w-6xl')}>
      <div className="flex items-center gap-2 px-0.5">
        <h1 className="text-ds-h2 font-semibold capitalize tracking-tight text-foreground">
          Welcome back, {firstName}
        </h1>
      </div>

      {role === 'admin' && sessionReady ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {adminReports.isPending ? (
            <>
              <Card className="border-primary/20">
                <CardContent>
                  <Skeleton className="mb-2 h-3 w-40" />
                  <Skeleton className="h-9 w-20" />
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardContent>
                  <Skeleton className="mb-2 h-3 w-44" />
                  <Skeleton className="h-9 w-16" />
                </CardContent>
              </Card>
            </>
          ) : adminReports.isError ? (
            <Card className="border-destructive/30 sm:col-span-2">
              <CardContent className="text-sm text-destructive" role="alert">
                Could not load today&apos;s metrics.{' '}
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => void adminReports.refetch()}
                >
                  Retry
                </button>
              </CardContent>
            </Card>
          ) : adminReports.data ? (
            <>
              <Link
                to="/dashboard/team/reports"
                className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-border transition-colors hover:border-primary/30">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Today&apos;s claimed leads
                      </p>
                      <UserPlus className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                    </div>
                    <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', adminReports.data.live_summary.leads_claimed_today > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                      {adminReports.data.live_summary.leads_claimed_today > 0
                        ? adminReports.data.live_summary.leads_claimed_today
                        : 'None yet'}
                    </p>
                    <p className="mt-1.5 text-ds-caption text-subtle">
                      Pool / ledger claims (IST day)
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link
                to="/dashboard/team/flp-min-billing"
                className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-border transition-colors hover:border-primary/30">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Today&apos;s FLP approvals
                      </p>
                      <ClipboardCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    </div>
                    <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', adminReports.data.live_summary.payment_proofs_approved_today > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                      {adminReports.data.live_summary.payment_proofs_approved_today > 0
                        ? adminReports.data.live_summary.payment_proofs_approved_today
                        : 'None yet'}
                    </p>
                    <p className="mt-1.5 text-ds-caption text-subtle">
                      Payment proofs approved today (IST)
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {role === 'team' || role === 'leader' ? <GateAssistantCard sessionReady={sessionReady} /> : null}

      {role === 'team' ? <MissionHomePanel /> : null}

      {role === 'team' ? <CampaignProgressCard /> : null}

      {wb.isError ? (
        <ErrorState
          message={
            wb.error instanceof Error
              ? wb.error.message
              : 'Could not load overview data.'
          }
          onRetry={() => void wb.refetch()}
        />
      ) : null}

      <div>
        <h2 className="mb-4 font-heading text-ds-h2 text-foreground">
          Overview
        </h2>
        {kpiLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-primary/20">
                <CardContent>
                  <Skeleton className="mb-2 h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link
              to="/dashboard/work/workboard"
              className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-blue-500/20 bg-gradient-to-br from-blue-500/[0.08] to-transparent transition-all hover:border-blue-500/35 hover:shadow-[var(--shadow-card-hover)]">
                <CardContent>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Active leads
                    </p>
                    <TrendingUp className="size-4 shrink-0 text-blue-600/70 dark:text-blue-400/70" aria-hidden />
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-blue-600 dark:text-blue-400">
                    {metrics.activeTotal}
                  </p>
                  <p className="mt-1.5 text-ds-caption text-subtle">
                    In your scope · open workboard
                  </p>
                </CardContent>
              </Card>
            </Link>
            {role === 'admin' || role === 'leader' ? (
                <Link
                to="/dashboard/work/follow-ups"
                className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-transparent transition-all hover:border-amber-500/35 hover:shadow-[var(--shadow-card-hover)]">
                  <CardContent>
                  <div className="flex items-center justify-between gap-1">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Open follow-ups
                      </p>
                      {openFollowUps > 0 && (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400" aria-hidden>↑</span>
                      )}
                    </div>
                    <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', openFollowUps > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                      {openFollowUps}
                    </p>
                    <p className="mt-1.5 text-ds-caption text-subtle">
                      Not completed · open queue
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : role === 'team' ? (
              <Link
                to="/dashboard/other/live-session"
                className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-primary/20 transition-all hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)]">
                  <CardContent>
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Live session
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">Join link and schedule</p>
                    <p className="mt-1.5 text-ds-caption text-subtle">
                      Same as legacy zoom block — opens Live Session page
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card className="border-primary/20">
                <CardContent>
                  <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                    Open follow-ups
                  </p>
                  <p className="mt-1.5 text-ds-caption text-subtle">Sign in to see your workspace.</p>
                </CardContent>
              </Card>
            )}
            <Link
              to="/dashboard/work/leads"
              className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent transition-all hover:border-emerald-500/35 hover:shadow-[var(--shadow-card-hover)]">
                <CardContent>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Converted
                    </p>
                    {metrics.winRatePct !== null && (
                      <span className={cn('text-xs font-semibold', metrics.won > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} aria-hidden>
                        {metrics.won > 0 ? '↑' : '—'} {metrics.winRatePct}%
                      </span>
                    )}
                  </div>
                  <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', metrics.won > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                    {metrics.won}
                  </p>
                  <p className="mt-1.5 text-ds-caption text-subtle">
                    {metrics.winRatePct !== null ? `Win rate ${metrics.winRatePct}%` : 'No closed outcomes yet'}
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link
              to="/dashboard/work/leads"
              className="block rounded no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent transition-all hover:border-violet-500/35 hover:shadow-[var(--shadow-card-hover)]">
                <CardContent>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      New leads
                    </p>
                    {metrics.newLeads > 0 && (
                      <span className="text-xs font-semibold text-violet-600/70 dark:text-violet-400/70" aria-hidden>↑</span>
                    )}
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-violet-600 dark:text-violet-400">
                    {metrics.newLeads}
                  </p>
                  <p className="mt-1.5 text-ds-caption text-subtle">
                    New lead stage · open list
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}
      </div>

      {role === 'leader' && <WarRoomDashboard los={los} lcc={lcc} wb={wb} />}

      <XpBadge />

      <XpLeaderboard />

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-ds-h3">Quick actions</CardTitle>
          <CardDescription>Jump to frequently used sections</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.Icon
            return (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto w-full p-0 font-normal"
                asChild
              >
                <Link
                  to={action.to}
                  className="inline-flex w-full items-center justify-between gap-3 px-4 py-3 no-underline"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate font-medium text-foreground">{action.label}</span>
                    {action.badgeCount != null ? (
                      <Badge variant="primary" className="ml-1 shrink-0">
                        {action.badgeCount}
                      </Badge>
                    ) : null}
                  </span>
                  <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden />
                </Link>
              </Button>
            )
          })}
        </CardContent>
      </Card>

      {role === 'leader' && (lcc.data?.fires?.members_at_risk ?? 0) > 0 && (
        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-ds-h3">
              <AlertTriangle className="size-5 text-red-500" />
              At Risk
            </CardTitle>
            <CardDescription>
              {lcc.data?.fires?.members_at_risk} member{lcc.data?.fires?.members_at_risk !== 1 ? 's' : ''} need attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <span className="text-sm font-medium">Members at risk</span>
              <span className="text-lg font-extrabold text-red-500 tabular-nums">{lcc.data?.fires?.members_at_risk}</span>
            </div>
            {los.data?.inactive_count != null && los.data.inactive_count > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <span className="text-sm font-medium">Below call target</span>
                <span className="text-lg font-extrabold text-amber-500 tabular-nums">{los.data.inactive_count}</span>
              </div>
            )}
            <Button variant="outline" size="sm" className="mt-2 w-full" asChild>
              <Link to="/dashboard/team/tracking">View team tracking</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {role === 'team' || role === 'leader' ? <VerificationHomePanel /> : null}

      <CcSummaryCard enabled={sessionReady} />

      <CollapsibleSection title="Recent Leads" defaultOpen={false}>
        <Card className="border-primary/20">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-ds-h3">Recent leads</CardTitle>
              <CardDescription>
                Your 8 most recent leads
              </CardDescription>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/dashboard/work/leads">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {wb.isPending && sessionReady ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentLeads.length === 0 ? (
              <p className="text-ds-body text-muted-foreground">
                No leads yet. Open{' '}
                <Link
                  to="/dashboard/work/leads"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Leads
                </Link>{' '}
                to create or import.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLeads.map((lead) => {
                    const isDay1 = lead.status === 'day1' && (role === 'leader' || role === 'admin')
                    return (
                      <Fragment key={lead.id}>
                        <TableRow>
                          <TableCell className="font-medium capitalize">{lead.name?.toLowerCase()}</TableCell>
                          <TableCell>
                            {lead.phone?.trim() ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-ds-caption tabular-nums text-muted-foreground">{lead.phone}</span>
                                <LeadContactActions phone={lead.phone} />
                              </div>
                            ) : (
                              <span className="text-ds-caption text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{statusLabel(lead.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-ds-caption text-muted-foreground">
                            {new Date(lead.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                        {isDay1 && (
                          <Day1PipelineRow
                            lead={lead}
                            patching={patchLead.isPending}
                            onPatch={(id, body) => patchLead.mutate({ id, body })}
                          />
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </CollapsibleSection>

      {mePending && !me ? (
        <div className="flex justify-center py-8">
          <LoadingState label="Loading session…" />
        </div>
      ) : null}
    </div>
  )
}
