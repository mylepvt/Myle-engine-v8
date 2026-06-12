import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRightLeft,
  Banknote,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cog,
  CreditCard,
  FileDown,
  FileText,
  GitBranch,
  GraduationCap,
  Layers3,
  ListChecks,
  PhoneCall,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { EmptyStatePremium } from '@/components/ui/empty-state-premium'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useAdminActivitySSE } from '@/hooks/use-admin-activity-sse'
import { AdminActivityPanel } from '@/components/dashboard/AdminActivityPanel'
import { CcSummaryCard } from '@/components/dashboard/CcSummaryCard'
import { LiveTeamActivity } from '@/components/dashboard/LiveTeamActivity'
import { LiveOpsDashboard } from '@/components/dashboard/live-ops/LiveOpsDashboard'
import { useLiveDashboardStore } from '@/stores/live-dashboard-store'
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard'
import { useAppSettingsQuery, useSystemUsersSummaryQuery } from '@/hooks/use-settings-query'
import { useActiveWatchersQuery } from '@/hooks/use-flp-min-billing-video-query'
import { useFlpMinBillingApprovalsPendingQuery, useTeamMembersQuery, useUpdateMemberComplianceMutation, type TeamMemberPublic } from '@/hooks/use-team-query'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useLeaderHealthQuery, type LeaderHealthItem } from '@/hooks/use-admin-leader-health-query'
import { useOnlineNowQuery, type OnlineUserItem } from '@/hooks/use-online-now-query'
import { useWalletRechargeRequestsQuery } from '@/hooks/use-wallet-recharge-query'
import { useInvoicesQuery } from '@/hooks/use-invoices-query'
import { useLeadControlQuery } from '@/hooks/use-lead-control-query'
import { LEAD_STATUS_OPTIONS, useLeadsQuery, type LeadPublic } from '@/hooks/use-leads-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { RiskDashboard } from '@/components/dashboard/RiskDashboard'
import { BlockerIntelligencePanel } from '@/components/dashboard/BlockerIntelligencePanel'
import { AutomationPanel } from '@/components/dashboard/AutomationPanel'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { useOrganizationScore } from '@/hooks/use-organization-score-query'
import { useAdminMissionSummary } from '@/hooks/use-missions-query'
import { useCampaigns, useCreateCampaign, useCampaignMetrics } from '@/hooks/use-training-campaign-query'
import { useLeaderEffectiveness } from '@/hooks/use-leader-effectiveness-query'
import { useVerificationSummary, useAdminTasks, useAdminTasksList } from '@/hooks/use-verification-query'
import { useOutcomeSummary, useDeadReasons, useZombieLeads, useRecycleLeads } from '@/hooks/use-lead-outcomes-query'

type Props = {
  firstName: string
}

type PremiereViewerRow = {
  viewer_id: string
  name: string
  masked_phone: string
  phone: string | null
  city: string
  session_date: string
  session_hour: number
  session_day: number
  percentage_watched: number
  current_time_sec: number
  first_seen_at: string | null
  last_seen_at: string | null
  lead_score: number
  watch_completed: boolean
  rejoined: boolean
  referred_by_name: string | null
}

async function fetchPremiereViewers(date?: string): Promise<PremiereViewerRow[]> {
  const params = date ? `?date=${encodeURIComponent(date)}` : ''
  const res = await apiFetch(`/api/v1/other/premiere/viewers${params}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(body, `HTTP ${res.status}`))
  return body as PremiereViewerRow[]
}

function usePremiereViewersQuery(enabled: boolean, date?: string) {
  return useQuery({
    queryKey: ['premiere', 'viewers', date ?? 'today'],
    queryFn: () => fetchPremiereViewers(date),
    enabled,
    refetchInterval: date ? false : 15_000,
  })
}

function isActiveNow(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 45_000
}


type PendingRegistrationRow = {
  id: number
  fbo_id: string
  username: string | null
  email: string
  phone: string | null
  created_at: string
  upline_fbo_id: string | null
  upline_name: string | null
}

type PendingRegistrationResponse = {
  items: PendingRegistrationRow[]
  total: number
}

type BudgetSummaryResponse = {
  grand_totals: {
    current_balance_cents: number
    period_recharge_cents: number
    period_spend_cents: number
    period_net_change_cents: number
  }
  note: string | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatInr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function statusLabel(status: string): string {
  return LEAD_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status.replace(/_/g, ' ')
}

/** Mini metric card for a training campaign — fetch-on-mount inside a card. */
function CampaignMetricsMini({ campaignId }: { campaignId: number }) {
  const { data, isPending, isError } = useCampaignMetrics(campaignId, true)
  if (isPending) return <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
  if (isError || !data) return <p className="text-xs text-muted-foreground">—</p>
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Attendance</span>
        <span className="font-semibold tabular-nums">{data.attendance}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Implementation</span>
        <span className={`font-semibold tabular-nums ${data.implementation_pct >= 50 ? 'text-green-600' : 'text-amber-600'}`}>{data.implementation_pct}%</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Success</span>
        <span className={`font-semibold tabular-nums ${data.success_pct >= 50 ? 'text-green-600' : data.success_pct >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{data.success_pct}%</span>
      </div>
    </div>
  )
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(messageFromApiErrorPayload(body, `HTTP ${response.status}`))
  }
  return body as T
}

type StatVariant = 'default' | 'warning' | 'success' | 'danger'

const STAT_VARIANT_STYLES: Record<StatVariant, { accent: string; value: string; dot: string }> = {
  default: {
    accent: 'bg-primary/60',
    value: 'text-foreground',
    dot: 'bg-primary/40',
  },
  warning: {
    accent: 'bg-warning/70',
    value: 'text-warning',
    dot: 'bg-warning/50',
  },
  success: {
    accent: 'bg-success/70',
    value: 'text-success',
    dot: 'bg-success/50',
  },
  danger: {
    accent: 'bg-destructive/70',
    value: 'text-destructive',
    dot: 'bg-destructive/50',
  },
}

function StatCard({
  label,
  value,
  hint,
  variant = 'default',
  to,
}: {
  label: string
  value: string | number
  hint: string
  variant?: StatVariant
  to?: string
}) {
  const styles = STAT_VARIANT_STYLES[variant]
  const inner = (
    <div title={hint} className="flex h-[68px] items-center gap-3 px-4">
      <div className={`h-7 w-[3px] shrink-0 rounded-full ${styles.accent}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.62rem] font-medium tracking-[0.08em] text-muted-foreground/60" style={{ textTransform: 'none' }}>{label}</p>
        <p className={`mt-0.5 font-heading text-[1.7rem] font-semibold leading-none tabular-nums ${styles.value}`}>{value}</p>
      </div>
    </div>
  )
  if (to) return (
    <CardLink to={to} className="overflow-hidden transition-all hover:border-border/80 hover:shadow-sm">
      {inner}
    </CardLink>
  )
  return <Card className="overflow-hidden">{inner}</Card>
}

function DeskShortcut({
  to,
  title,
  description,
  icon,
  badge,
}: {
  to: string
  title: string
  description: string
  icon: ReactNode
  badge?: string | number | null
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3.5 rounded border border-border/60 bg-card/40 p-3.5 no-underline transition-[background-color,border-color] duration-100 hover:border-border hover:bg-card"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted/60 text-primary ring-1 ring-border/40 transition-colors duration-200 group-hover:bg-primary/[0.08] group-hover:ring-primary/30">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {badge != null && Number(badge) > 0 ? (
            <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary/70" />
    </Link>
  )
}

function LiveOnlinePanel({ users }: { users: OnlineUserItem[] }) {
  const working = users.filter((u) => u.is_working)
  const idle = users.filter((u) => !u.is_working)

  const Row = ({ u }: { u: OnlineUserItem }) => (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          u.presence_status === 'online' ? 'bg-success' : 'bg-warning'
        }`}
        aria-label={u.presence_status}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{u.name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60 capitalize">{u.role}</span>
      {u.is_working ? (
        <span className="shrink-0 text-[10px] text-success">
          {u.calls_today > 0 ? `${u.calls_today}c` : ''}{u.leads_today > 0 ? ` ${u.leads_today}l` : ''}
        </span>
      ) : (
        <span className="shrink-0 text-[10px] text-muted-foreground/40">idle</span>
      )}
    </div>
  )

  return (
    <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
      {working.length > 0 && (
        <div className="pb-1">
          <p className="sticky top-0 bg-card px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-success">
            Working ({working.length})
          </p>
          <div className="px-3">
            {working.map((u) => <Row key={u.user_id} u={u} />)}
          </div>
        </div>
      )}
      {idle.length > 0 && (
        <div className="pb-1">
          <p className="sticky top-0 bg-card px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            Not working ({idle.length})
          </p>
          <div className="px-3">
            {idle.map((u) => <Row key={u.user_id} u={u} />)}
          </div>
        </div>
      )}
      {users.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">No one online</p>
      )}
    </div>
  )
}

// ── Pulse chip — reusable clickable stat with dropdown ───────────────────────

function LeadResultRow({ lead }: { lead: LeadPublic }) {
  return (
    <div className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-md p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{lead.name}</p>
          <Badge variant="outline">{statusLabel(lead.status)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Owner: <span className="text-foreground">{lead.owner_name || 'Unknown'}</span>
          {' · '}
          Assignee: <span className="text-foreground">{lead.assigned_to_name || 'Unassigned'}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {lead.phone || 'No phone'} · Created {formatDate(lead.created_at)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link to={`/dashboard/work/leads/${lead.id}`}>Open lead</Link>
        </Button>
      </div>
    </div>
  )
}

function LeaderRingCard({ leader }: { leader: LeaderHealthItem }) {
  const score = leader.personal_consistency_score
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const ringColor =
    leader.personal_consistency_band === 'high'
      ? 'var(--success)'
      : leader.personal_consistency_band === 'medium'
        ? 'var(--warning)'
        : 'var(--destructive)'

  const presenceDot =
    leader.presence_status === 'online'
      ? 'bg-success'
      : leader.presence_status === 'idle'
        ? 'bg-warning'
        : 'bg-muted-foreground/30'

  return (
    <div className="relative flex flex-col items-center gap-3 rounded border border-border/60 bg-card/50 p-5">
      {/* Presence indicator */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${presenceDot}`} />
        <span className="text-[10px] capitalize text-muted-foreground">{leader.presence_status}</span>
      </div>

      {/* Progress ring */}
      <div className="relative flex items-center justify-center">
        <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-muted/30"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute text-center">
          <p className="text-xl font-bold leading-none tabular-nums text-foreground">{score}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">score</p>
        </div>
      </div>

      {/* Name */}
      <div className="text-center">
        <p className="font-semibold text-foreground">{leader.leader_name}</p>
        <p className="text-xs text-muted-foreground">{leader.fbo_id}</p>
      </div>

      {/* Personal stats */}
      <div className="w-full space-y-1.5 rounded border border-border/40 bg-muted/20 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Personal Today</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.personal_calls_today}</p>
            <p className="text-[9px] text-muted-foreground">Calls</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.personal_leads_added}</p>
            <p className="text-[9px] text-muted-foreground">Leads</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.personal_followups_done}</p>
            <p className="text-[9px] text-muted-foreground">Followups</p>
          </div>
        </div>
      </div>

      {/* Team stats */}
      <div className="w-full space-y-1.5 rounded border border-border/40 bg-muted/20 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Team</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.team_calls_today}</p>
            <p className="text-[9px] text-muted-foreground">Calls Today</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.team_size}</p>
            <p className="text-[9px] text-muted-foreground">Members</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.team_online_count}</p>
            <p className="text-[9px] text-muted-foreground">Online Now</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">{leader.team_avg_score}</p>
            <p className="text-[9px] text-muted-foreground">Avg Score</p>
          </div>
        </div>
      </div>

      {/* Day 2 indicator */}
      <div
        className={`w-full rounded border p-2.5 text-center ${
          leader.day2_leads_count > 0
            ? 'border-urgency-watch/30 bg-urgency-watch/[0.07]'
            : 'border-border/30 bg-muted/10'
        }`}
      >
        <p
          className={`text-sm font-bold tabular-nums ${
            leader.day2_leads_count > 0 ? 'text-urgency-watch' : 'text-muted-foreground'
          }`}
        >
          {leader.day2_leads_count}
        </p>
        <p className="text-[9px] text-muted-foreground">Day 2 Leads Active</p>
      </div>
    </div>
  )
}

const GRACE_RISK_CONFIG = {
  low:    { label: 'Low Risk',    cls: 'bg-success/15 text-success' },
  medium: { label: 'Medium Risk', cls: 'bg-warning/15 text-warning' },
  high:   { label: 'High Risk',   cls: 'bg-destructive/15 text-destructive' },
}

const GRACE_OUTCOME_LABEL: Record<string, { text: string; cls: string }> = {
  auto_restored: { text: 'Last: worked through it ✓', cls: 'text-success' },
  auto_removed:  { text: 'Last: removed at expiry ✗', cls: 'text-red-600 dark:text-red-400' },
  approved:      { text: 'Last: completed',            cls: 'text-muted-foreground' },
  cleared:       { text: 'Last: cleared early',        cls: 'text-amber-600 dark:text-amber-400' },
}

function GraceRequestRow({ member }: { member: TeamMemberPublic }) {
  const mut = useUpdateMemberComplianceMutation()
  const busy = mut.isPending

  function act(action: 'approve_grace_request' | 'reject_grace_request') {
    mut.mutate({ userId: member.id, action, graceEndDate: null, reason: null })
  }

  const risk = member.grace_risk ?? 'low'
  const riskCfg = GRACE_RISK_CONFIG[risk]
  const count30d = member.grace_count_30d ?? 0
  const lastOutcomeCfg = member.grace_last_outcome ? GRACE_OUTCOME_LABEL[member.grace_last_outcome] : null
  const streakNote = (member.calls_short_streak ?? 0) > 0 || (member.missing_report_streak ?? 0) > 0
    ? `Streak: ${[
        (member.calls_short_streak ?? 0) > 0 ? `${member.calls_short_streak}d low calls` : '',
        (member.missing_report_streak ?? 0) > 0 ? `${member.missing_report_streak}d no report` : '',
      ].filter(Boolean).join(' · ')}`
    : null

  return (
    <div className="space-y-2.5 rounded border border-border/60 bg-card/40 p-3.5">
      {/* Header row: name + risk badge */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">
          {member.username ?? member.fbo_id}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{member.fbo_id}</span>
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskCfg.cls}`}>
          {riskCfg.label}
        </span>
        {count30d >= 2 && (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
            Over monthly limit
          </span>
        )}
      </div>

      {/* Request details */}
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">
          Till {member.grace_request_end_date
            ? new Date(member.grace_request_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'}
          {member.grace_request_reason ? ` · ${member.grace_request_reason}` : ''}
        </p>
        {/* Grace intelligence context */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          <span className="text-muted-foreground">
            {count30d === 0 ? '1st grace this month' : `${count30d + 1}${count30d + 1 === 2 ? 'nd' : count30d + 1 === 3 ? 'rd' : 'th'} this month`}
          </span>
          {lastOutcomeCfg && (
            <span className={lastOutcomeCfg.cls}>{lastOutcomeCfg.text}</span>
          )}
          {streakNote && (
            <span className="text-amber-600 dark:text-amber-400">{streakNote}</span>
          )}
        </div>
      </div>

      {mut.isError && (
        <p className="text-xs text-destructive">{(mut.error as Error).message}</p>
      )}

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-success/40 text-success hover:bg-success/10"
          disabled={busy}
          onClick={() => act('approve_grace_request')}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={busy}
          onClick={() => act('reject_grace_request')}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}

const DASHBOARD_TABS: readonly { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'today', label: 'Today', Icon: CalendarDays },
  { value: 'leads', label: 'Leads', Icon: Search },
  { value: 'premiere', label: 'Live Attendees', Icon: Video },
  { value: 'team', label: 'Team', Icon: Users },
  { value: 'leaders', label: 'Leaders', Icon: Activity },
  { value: 'finance', label: 'Finance', Icon: Wallet },
  { value: 'content', label: 'Content', Icon: Settings },
  { value: 'audit', label: 'Audit', Icon: ShieldCheck },
  { value: 'verification', label: 'Verification', Icon: ListChecks },
  { value: 'outcomes', label: 'Outcomes', Icon: GitBranch },
  { value: 'missions', label: 'Missions', Icon: ClipboardCheck },
  { value: 'effectiveness', label: 'Effectiveness', Icon: Activity },
  { value: 'campaigns', label: 'Campaigns', Icon: GraduationCap },
  { value: 'risk', label: 'Risk', Icon: ShieldAlert },
  { value: 'automation', label: 'Automation', Icon: Cog },
]

/** Apple-style single view switcher — replaces an 8-wide tab strip with one clean
 *  popup button + dropdown (current view + total alert count, per-item badges). */
function DashboardViewSwitcher({
  active,
  badges,
  onSelect,
}: {
  active: string
  badges: Record<string, number>
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const current = DASHBOARD_TABS.find((t) => t.value === active) ?? DASHBOARD_TABS[0]
  const CurrentIcon = current.Icon
  const totalAlerts = Object.values(badges).reduce((a, b) => a + (b || 0), 0)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/70 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur transition hover:border-border hover:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <CurrentIcon className="size-4 text-primary" />
        <span>{current.label}</span>
        {totalAlerts > 0 && (
          <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
            {totalAlerts}
          </span>
        )}
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl"
        >
          {DASHBOARD_TABS.map((t) => {
            const Icon = t.Icon
            const badge = badges[t.value] ?? 0
            const isActive = t.value === active
            return (
              <button
                key={t.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(t.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  isActive ? 'bg-primary/12 font-semibold text-primary' : 'text-foreground/85 hover:bg-muted/60',
                )}
              >
                <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className="flex-1 text-left">{t.label}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                    {badge}
                  </span>
                )}
                {isActive && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AdminCommandCenter({ firstName }: Props) {
  const [activeTab, setActiveTab] = useState('today')
  const [leadSearch, setLeadSearch] = useState('')
  const deferredLeadSearch = useDeferredValue(leadSearch.trim())
  const [todayIST] = useState(() => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [viewerHistoryDate, setViewerHistoryDate] = useState<string>(todayIST)

  useAdminActivitySSE(true)

  const pendingRegistrations = useQuery({
    queryKey: ['team', 'pending-registrations'],
    queryFn: () => fetchJson<PendingRegistrationResponse>('/api/v1/team/pending-registrations'),
  })
  const enrollmentPending = useFlpMinBillingApprovalsPendingQuery()
  const rechargeRequests = useWalletRechargeRequestsQuery()
  const leadControl = useLeadControlQuery()
  const liveDash = useLiveDashboardStore()
  const leadPool = useLeadPoolQuery(true)
  const teamReports = useTeamReportsQuery('', true)
  const activeWatchers = useActiveWatchersQuery(activeTab === 'today')
  const vSummary = useVerificationSummary(activeTab === 'verification')
  const outcomeSummary = useOutcomeSummary(activeTab === 'outcomes')
  const deadReasons = useDeadReasons(activeTab === 'outcomes')
  const zombieLeads = useZombieLeads(activeTab === 'outcomes')
  const recycleLeads = useRecycleLeads(activeTab === 'outcomes')
  const missionSummary = useAdminMissionSummary(['today', 'leads', 'verification', 'outcomes', 'missions', 'effectiveness'].includes(activeTab))
  const effectiveness = useLeaderEffectiveness(['today', 'leads', 'verification', 'outcomes', 'missions', 'effectiveness'].includes(activeTab))
  const orgScore = useOrganizationScore(activeTab === 'today')
  const campaignList = useCampaigns(true, activeTab === 'campaigns')

  // Seed live dashboard store from REST data once loaded.
  // MUST run in an effect, not during render: the old in-render guard
  // (`!day1Total && !day2Total`) never flips when those totals are genuinely 0,
  // so setInitial fired on every render → infinite re-render → the whole admin
  // home froze (main thread blocked). A one-shot ref seeds exactly once.
  const liveSummary = teamReports.data?.live_summary
  const liveSeededRef = useRef(false)
  useEffect(() => {
    if (!liveSummary || liveSeededRef.current) return
    liveSeededRef.current = true
    liveDash.setInitial({
      callsToday: liveSummary.calls_made_today,
      day1Total: liveSummary.day1_total,
      day2Total: liveSummary.day2_total,
      claimedToday: liveSummary.leads_claimed_today,
      approvedToday: liveSummary.payment_proofs_approved_today,
      enrolledToday: liveSummary.flp_min_billing_today,
    })
  }, [liveSummary, liveDash])

  const systemUsersSummary = useSystemUsersSummaryQuery(activeTab === 'team')
  const teamMembers = useTeamMembersQuery()
  const invoices = useInvoicesQuery({ limit: 5, offset: 0 }, activeTab === 'finance')
  const budgetSummary = useQuery({
    queryKey: ['finance', 'budget-export', 'command-center'],
    queryFn: () => fetchJson<BudgetSummaryResponse>('/api/v1/finance/budget-export?period=month'),
    enabled: activeTab === 'finance',
    staleTime: 30_000,
  })
  const appSettings = useAppSettingsQuery(activeTab === 'content')
  const leaderHealth = useLeaderHealthQuery(activeTab === 'leaders')
  const premiereViewers = usePremiereViewersQuery(true)
  const isHistoryToday = viewerHistoryDate === todayIST
  const premiereViewersHistory = usePremiereViewersQuery(activeTab === 'premiere' && !isHistoryToday, viewerHistoryDate)
  const premiereData = isHistoryToday ? premiereViewers : premiereViewersHistory
  const leadSearchResults = useLeadsQuery(
    deferredLeadSearch.length > 0,
    { q: deferredLeadSearch, status: '' },
    'active',
    { searchAllSections: true },
  )

  const pendingRechargeItems = useMemo(
    () => (rechargeRequests.data?.items ?? []).filter((item) => item.status === 'pending'),
    [rechargeRequests.data?.items],
  )
  const flaggedMembers = useMemo(() => {
    const items = teamMembers.data?.items ?? []
    return items
      .filter(
        (member) =>
          member.access_blocked ||
          member.training_required ||
          (member.compliance_level &&
            member.compliance_level !== 'clear' &&
            member.compliance_level !== 'not_applicable'),
      )
      .slice(0, 8)
  }, [teamMembers.data?.items])

  const settingsMap = appSettings.data?.settings ?? {}
  const configuredBatchKeys = useMemo(
    () => Object.keys(settingsMap).filter((key) => key.startsWith('batch_') && settingsMap[key].trim()).length,
    [settingsMap],
  )

  const pendingGraceMembers = useMemo(
    () => (teamMembers.data?.items ?? []).filter((m) => m.grace_request_end_date != null),
    [teamMembers.data?.items],
  )
  const pendingGraceCount = pendingGraceMembers.length

  const pendingTotal =
    (pendingRegistrations.data?.total ?? 0) +
    (enrollmentPending.data?.total ?? 0) +
    pendingRechargeItems.length +
    pendingGraceCount

  const liveWatcherCount = activeWatchers.data?.total ?? 0
  const premiereActiveCount = (premiereViewers.data ?? []).filter((v) => isActiveNow(v.last_seen_at)).length

  const onlineNow = useOnlineNowQuery()
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false)
  const onlinePanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!onlinePanelOpen) return
    const handler = (e: MouseEvent) => {
      if (onlinePanelRef.current && !onlinePanelRef.current.contains(e.target as Node)) {
        setOnlinePanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onlinePanelOpen])

  return (
    <div className="mx-auto max-w-7xl space-y-6 overflow-x-hidden">
      {/* ── Compact operational summary ── */}
      <div className="rounded border border-border/60 bg-card px-2 sm:px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <p className="text-sm font-medium text-foreground shrink-0">Good day, {firstName}</p>
              {pendingTotal > 0 && (
                <span className="flex items-center gap-1 rounded border border-warning/20 bg-warning/[0.07] px-1.5 py-0.5 text-[10px]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-warning" />
                  </span>
                  <span className="font-semibold text-warning">{pendingTotal} pending</span>
                </span>
              )}
              {liveWatcherCount > 0 && (
                <span className="flex items-center gap-1 rounded border border-destructive/20 bg-destructive/[0.07] px-1.5 py-0.5 text-[10px]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-destructive" />
                  </span>
                  <span className="font-semibold text-destructive">{liveWatcherCount} watching</span>
                </span>
              )}
              {premiereActiveCount > 0 && (
                <span className="flex items-center gap-1 rounded border border-destructive/20 bg-destructive/[0.07] px-1.5 py-0.5 text-[10px]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-destructive" />
                  </span>
                  <span className="font-semibold text-destructive">{premiereActiveCount} live</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 min-w-0">
            {/* Live online counter */}
            <div ref={onlinePanelRef} className="relative shrink-0">
              <button
                onClick={() => setOnlinePanelOpen((v) => !v)}
                className="flex items-center gap-1 rounded border border-success/20 bg-success/[0.07] px-1.5 py-0.5 text-[10px] hover:bg-success/[0.12] transition-colors whitespace-nowrap"
              >
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                <span className="font-semibold text-success">
                  {onlineNow.data?.online_count ?? 0} online
                </span>
              </button>
              {onlinePanelOpen && (
                <div className="fixed right-2 sm:absolute sm:right-0 top-auto sm:top-full z-50 mt-1.5 w-72 sm:w-64 rounded border border-border/60 bg-card shadow-xl max-sm:right-2">
                  <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
                    <span className="text-[11px] font-semibold text-foreground">Online now</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {onlineNow.data?.working_count ?? 0} working · {onlineNow.data?.not_working_count ?? 0} idle
                    </span>
                  </div>
                  <LiveOnlinePanel users={onlineNow.data?.users ?? []} />
                </div>
              )}
            </div>
            <Button asChild variant="secondary" size="sm" className="h-7 px-2 text-xs">
              <Link to="/dashboard/work/leads">Leads</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-7 px-2 text-xs">
              <Link to="/dashboard/finance/recharge-admin">Finance</Link>
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <DashboardViewSwitcher
            active={activeTab}
            badges={{
              today: pendingTotal,
              premiere: premiereActiveCount,
              team: pendingGraceCount,
              finance: pendingRechargeItems.length,
            }}
            onSelect={setActiveTab}
          />
        </div>

        <TabsContent value="today">
          {/* Unified Executive Dashboard — CEO View */}
          <div className="mb-6">
            <ExecutiveDashboard />
          </div>

          {/* Organization Execution Score — morning pulse */}
          {orgScore.data && (
            <div className="mb-6">
              <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/[0.03]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Activity className="size-4 text-primary" />
                      Organization Execution Score
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {orgScore.data.total_members} members · {orgScore.data.total_leads} leads
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {new Date(orgScore.data.computed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {/* Big score */}
                    <div className="flex shrink-0 items-center justify-center">
                      <div className="flex size-24 items-center justify-center rounded-full border-4 border-primary/20">
                        <span className={`text-3xl font-bold tabular-nums ${
                          orgScore.data.overall_score >= 70 ? 'text-green-600' : orgScore.data.overall_score >= 40 ? 'text-amber-600' : 'text-red-600'
                        }`}>{orgScore.data.overall_score}</span>
                      </div>
                    </div>
                    {/* Component bars */}
                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { key: 'mission_completion', label: 'Mission', value: orgScore.data.components.mission_completion },
                        { key: 'verification', label: 'Verification', value: orgScore.data.components.verification },
                        { key: 'lead_activity', label: 'Lead Activity', value: orgScore.data.components.lead_activity },
                        { key: 'zombie_leads', label: 'Zombie Score', value: orgScore.data.components.zombie_leads },
                      ].map((c) => {
                        const barColor = c.value >= 70 ? 'bg-green-500' : c.value >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        return (
                          <div key={c.key} className="rounded-lg border border-border/40 p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-muted-foreground">{c.label}</span>
                              <span className="text-sm font-bold tabular-nums text-foreground">{c.value}</span>
                            </div>
                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.value}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Full live ops dashboard */}
          <div className="mb-6">
            <LiveOpsDashboard />
          </div>

          <div className="mb-6">
            <CcSummaryCard />
          </div>

          <div className="space-y-4">
              {/* Action queue + snapshot — single source of truth, no duplicate KPI/queue rows.
                  (Calls/Day1/Day2/Claims live in the KPI bar + funnel above; the old flat ops
                  list and the card grid were the same five actions — merged into one here.) */}
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BellRing className="size-4" />
                      Action Queue
                    </CardTitle>
                    <CardDescription>Everything waiting on you — live counts, one tap to act.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-2">
                    {[
                      { title: 'Pending registrations', description: 'Self-serve signups awaiting admin approval.', count: pendingRegistrations.data?.total ?? 0, icon: <Users className="size-4" />, to: '/dashboard/team/approvals' },
                      { title: 'Min. FLP Billing', description: 'FLP billing proofs pending review.', count: enrollmentPending.data?.total ?? 0, icon: <ClipboardCheck className="size-4" />, to: '/dashboard/team/flp-min-billing' },
                      { title: 'Recharge requests', description: 'Wallet recharges awaiting finance approval.', count: pendingRechargeItems.length, icon: <Wallet className="size-4" />, to: '/dashboard/finance/recharge-admin' },
                      { title: 'Grace requests', description: 'Team grace-period requests to review.', count: pendingGraceCount, icon: <Clock className="size-4" />, to: '/dashboard/team/members' },
                      { title: 'Reassign ready', description: 'Archived leads eligible for redistribution.', count: leadControl.data?.queue_total ?? 0, icon: <ArrowRightLeft className="size-4" />, to: '/dashboard/system/lead-control' },
                      { title: 'Archive incubation', description: 'Archived leads nearing stale reassignment.', count: leadControl.data?.incubation_total ?? 0, icon: <Layers3 className="size-4" />, to: '/dashboard/system/lead-control' },
                    ].map((row) => {
                      const active = row.count > 0
                      return (
                        <Link
                          key={row.title}
                          to={row.to}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                            active
                              ? 'border-amber-400/30 bg-amber-400/[0.06] hover:bg-amber-400/[0.1]'
                              : 'border-border/50 bg-card/40 hover:bg-muted/40',
                          )}
                        >
                          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', active ? 'bg-amber-400/15 text-amber-300' : 'bg-muted/50 text-muted-foreground')}>
                            {row.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{row.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{row.description}</span>
                          </span>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums', active ? 'bg-amber-400/20 text-amber-300' : 'text-muted-foreground/40')}>
                            {row.count}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      )
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Today Snapshot</CardTitle>
                    <CardDescription>Fast operational pulse for the current admin day.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="surface-inset rounded-md p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Claimed today</p>
                      <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">{liveDash.claimedToday || (liveSummary?.leads_claimed_today ?? 0)}</p>
                    </div>
                    <div className="surface-inset rounded-md p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approved today</p>
                      <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">
                        {liveDash.approvedToday || (liveSummary?.payment_proofs_approved_today ?? 0)}
                      </p>
                    </div>
                    <div className="surface-inset rounded-md p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lead pool visible</p>
                      <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">{leadPool.data?.total ?? 0}</p>
                    </div>
                    <div className="surface-inset rounded-md p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Latest reassignment</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {leadControl.data?.history?.[0]?.lead_name ?? 'No movement yet'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {leadControl.data?.history?.[0]
                          ? formatDateTime(leadControl.data.history[0].occurred_at)
                          : 'Soft log will appear here.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {pendingGraceCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="size-4" />
                      Pending Grace Requests
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-400">
                        {pendingGraceCount}
                      </span>
                    </CardTitle>
                    <CardDescription>Review and action each request without leaving the dashboard.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {pendingGraceMembers.map((member) => (
                      <GraceRequestRow key={member.id} member={member} />
                    ))}
                  </CardContent>
                </Card>
              )}

              <AdminActivityPanel />
          </div>
        </TabsContent>

        <TabsContent value="leads" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="size-4" />
                Universal Lead Search
              </CardTitle>
              <CardDescription>
                Search all admin-visible sections and jump straight into the lead when needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name, phone, city, notes</span>
                <input
                  value={leadSearch}
                  onChange={(event) => setLeadSearch(event.target.value)}
                  placeholder="Search any lead across active, archived, retarget, and more"
                  className="w-full rounded border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/40"
                />
              </label>
              {deferredLeadSearch.length === 0 ? (
                <EmptyStatePremium
                  title="Start typing to search"
                  description="This search is meant for admin jump-and-review across sections."
                />
              ) : leadSearchResults.isError ? (
                <ErrorState
                  title="Lead search failed"
                  message={leadSearchResults.error instanceof Error ? leadSearchResults.error.message : 'Please try again.'}
                  onRetry={() => void leadSearchResults.refetch()}
                />
              ) : (leadSearchResults.data?.items ?? []).length === 0 ? (
                <EmptyStatePremium
                  variant="search"
                  title="No leads matched"
                  description="Try a broader phone, name, city, or note fragment."
                />
              ) : (
                <div className="space-y-3">
                  {(leadSearchResults.data?.items ?? []).slice(0, 8).map((lead) => (
                    <LeadResultRow key={lead.id} lead={lead} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead Desk</CardTitle>
                <CardDescription>Everything admin needs for movement and storage, without hunting through nav.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <DeskShortcut
                  to="/dashboard/system/lead-control"
                  title="Lead control"
                  description="Manual reassignment, ready queue, and ownership-safe movement."
                  icon={<ArrowRightLeft className="size-4" />}
                  badge={leadControl.data?.queue_total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/work/archived"
                  title="Archived leads"
                  description="Review quiet leads and restore them only when needed."
                  icon={<Layers3 className="size-4" />}
                  badge={leadControl.data?.incubation_total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/work/lead-pool-admin"
                  title="Admin lead pool"
                  description="Import, inspect, and prepare fresh lead inventory."
                  icon={<Banknote className="size-4" />}
                  badge={leadPool.data?.total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/work/recycle-bin"
                  title="Recycle bin"
                  description="Review deleted leads before permanent decisions."
                  icon={<FileText className="size-4" />}
                />
              </CardContent>
            </Card>


          </section>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Users"
              value={systemUsersSummary.data?.total_users ?? 0}
              hint="Approved + pending + blocked users in the system summary."
              variant="success"
              to="/dashboard/team/members"
            />
            <StatCard
              label="Leaders"
              value={systemUsersSummary.data?.by_role?.leader ?? 0}
              hint="Current approved leader seats."
              to="/dashboard/team/members"
            />
            <StatCard
              label="Team Members"
              value={systemUsersSummary.data?.by_role?.team ?? 0}
              hint="Current approved team execution layer."
              to="/dashboard/team/members"
            />
            <StatCard
              label="Blocked Users"
              value={systemUsersSummary.data?.blocked_users ?? 0}
              hint="Users currently blocked from normal access."
              variant="danger"
              to="/dashboard/team/members"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]">
            <LiveTeamActivity />
            <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Member Desk</CardTitle>
                <CardDescription>Role, compliance, password reset, access lock, and training live in one admin member surface.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <DeskShortcut
                  to="/dashboard/team/members"
                  title="Team members"
                  description="Role changes, compliance, password reset, lock/unlock, and training toggles."
                  icon={<Users className="size-4" />}
                  badge={teamMembers.data?.total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/team/tracking"
                  title="Team tracking"
                  description="Operational tracking by member with discipline visibility."
                  icon={<ShieldCheck className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/team/reports"
                  title="Team reports"
                  description="Daily conversion and pipeline reporting by hierarchy."
                  icon={<FileDown className="size-4" />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Members Needing Attention</CardTitle>
                <CardDescription>Fast triage list before you open the full member desk.</CardDescription>
              </CardHeader>
              <CardContent>
                {flaggedMembers.length === 0 ? (
                  <EmptyStatePremium
                    variant="notifications"
                    title="No urgent member flags"
                    description="Training locks, access blocks, and compliance warnings will surface here."
                  />
                ) : (
                  <div className="space-y-3">
                    {flaggedMembers.map((member) => (
                      <div key={member.id} className="surface-inset flex flex-wrap items-start justify-between gap-3 rounded-md p-4">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{member.name || member.fbo_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.role} · {member.email}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {member.training_required ? <Badge variant="warning">Training locked</Badge> : null}
                            {member.access_blocked ? <Badge variant="destructive">Access blocked</Badge> : null}
                            {member.compliance_title ? <Badge variant="outline">{member.compliance_title}</Badge> : null}
                          </div>
                        </div>
                        <Button asChild size="sm" variant="secondary">
                          <Link to="/dashboard/team/members">Open member desk</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="leaders" className="space-y-6">
          {/* Summary bar */}
          {leaderHealth.data && (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <StatCard
                label="Total Leaders"
                value={leaderHealth.data.leaders.length}
                hint="Approved leaders in the system."
                variant="default"
              />
              <StatCard
                label="Online Now"
                value={leaderHealth.data.leaders.filter((l) => l.presence_status === 'online').length}
                hint="Leaders currently active on the platform."
                variant="success"
              />
              <StatCard
                label="High Consistency"
                value={leaderHealth.data.leaders.filter((l) => l.personal_consistency_band === 'high').length}
                hint="Leaders with consistency score ≥ 75 today."
                variant="success"
              />
              <StatCard
                label="Day 2 Leads Active"
                value={leaderHealth.data.leaders.reduce((s, l) => s + l.day2_leads_count, 0)}
                hint="Total leads currently in Day 2 stage across all leaders."
                variant="default"
              />
            </section>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="size-4" />
                Leader Health Rings
              </CardTitle>
              <CardDescription>
                Progress ring = personal consistency score. Green ≥ 75 · Amber 40–74 · Red &lt; 40. Refreshes every minute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leaderHealth.isPending ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-80" />
                  ))}
                </div>
              ) : leaderHealth.isError ? (
                <ErrorState
                  title="Could not load leader health"
                  message={leaderHealth.error instanceof Error ? leaderHealth.error.message : 'Please try again.'}
                  onRetry={() => void leaderHealth.refetch()}
                />
              ) : (leaderHealth.data?.leaders ?? []).length === 0 ? (
                <EmptyStatePremium
                  variant="analytics"
                  title="No leaders found"
                  description="Approved leaders will appear here with their daily health metrics."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {leaderHealth.data!.leaders.map((leader) => (
                    <LeaderRingCard key={leader.leader_id} leader={leader} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team calling breakdown per leader */}
          {(leaderHealth.data?.leaders ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PhoneCall className="size-4" />
                  Calling Leaderboard
                </CardTitle>
                <CardDescription>
                  Side-by-side comparison of personal and team calls for each leader today.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...leaderHealth.data!.leaders]
                  .sort((a, b) => b.personal_calls_today + b.team_calls_today - (a.personal_calls_today + a.team_calls_today))
                  .map((leader) => {
                    const total = leader.personal_calls_today + leader.team_calls_today
                    const maxTotal = Math.max(
                      1,
                      ...leaderHealth.data!.leaders.map((l) => l.personal_calls_today + l.team_calls_today),
                    )
                    return (
                      <div key={leader.leader_id} className="surface-inset rounded-md p-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${
                                leader.presence_status === 'online'
                                  ? 'bg-emerald-500'
                                  : leader.presence_status === 'idle'
                                    ? 'bg-amber-400'
                                    : 'bg-muted-foreground/30'
                              }`}
                              aria-label={leader.presence_status}
                            />
                            <p className="font-medium text-foreground">{leader.leader_name}</p>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>
                              Personal: <span className="font-semibold text-foreground">{leader.personal_calls_today}</span>
                            </span>
                            <span>
                              Team: <span className="font-semibold text-foreground">{leader.team_calls_today}</span>
                            </span>
                            <span>
                              Total: <span className="font-bold text-primary">{total}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
                          <div
                            className="h-full bg-primary/70 transition-all"
                            style={{ width: `${(leader.personal_calls_today / maxTotal) * 100}%` }}
                          />
                          <div
                            className="h-full bg-primary/30 transition-all"
                            style={{ width: `${(leader.team_calls_today / maxTotal) * 100}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex gap-4 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block size-2 rounded-sm bg-primary/70" />
                            Personal
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block size-2 rounded-sm bg-primary/30" />
                            Team
                          </span>
                          <span className="ml-auto">{leader.team_size} team member{leader.team_size !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Visible Balance"
              value={formatInr(budgetSummary.data?.grand_totals.current_balance_cents ?? 0)}
              hint="Current visible wallet balance across the export view."
              variant="success"
              to="/dashboard/finance/budget-export"
            />
            <StatCard
              label="Month Recharge"
              value={formatInr(budgetSummary.data?.grand_totals.period_recharge_cents ?? 0)}
              hint="Current month recharge volume."
              variant="success"
              to="/dashboard/finance/budget-export"
            />
            <StatCard
              label="Month Spend"
              value={formatInr(budgetSummary.data?.grand_totals.period_spend_cents ?? 0)}
              hint="Current month spend volume."
              to="/dashboard/finance/budget-export"
            />
            <StatCard
              label="Pending Recharges"
              value={pendingRechargeItems.length}
              hint="Recharge approvals still pending."
              variant="warning"
              to="/dashboard/finance/recharge-admin"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Finance Desk</CardTitle>
                <CardDescription>Recharge approvals, invoices, and budget hierarchy from one place.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <DeskShortcut
                  to="/dashboard/finance/recharge-admin"
                  title="Recharge requests"
                  description="Approve pending wallet deposits."
                  icon={<Wallet className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/finance/invoices"
                  title="Invoices"
                  description="Review generated receipts and tax invoices."
                  icon={<FileText className="size-4" />}
                  badge={invoices.data?.total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/finance/budget-export"
                  title="Budget export"
                  description="Leader hierarchy, member balances, and history export."
                  icon={<CreditCard className="size-4" />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Invoices</CardTitle>
                <CardDescription>Latest finance documents without leaving the command center.</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.isError ? (
                  <ErrorState
                    title="Invoices failed"
                    message={invoices.error instanceof Error ? invoices.error.message : 'Please try again.'}
                    onRetry={() => void invoices.refetch()}
                  />
                ) : (invoices.data?.items ?? []).length === 0 ? (
                  <EmptyStatePremium variant="wallet" title="No invoices yet" description="Recent invoice documents will show here." />
                ) : (
                  <div className="space-y-3">
                    {invoices.data?.items.map((invoice) => (
                      <div key={invoice.invoice_number} className="surface-inset rounded-md p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{invoice.member_name}</p>
                          <Badge variant="outline">{invoice.doc_type.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {invoice.invoice_number} · {formatDateTime(invoice.issued_at)}
                        </p>
                        <p className="mt-2 text-sm text-foreground">{formatInr(invoice.total_cents)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Live Session"
              value={settingsMap.live_session_url ? 'Ready' : 'Missing'}
              hint="Community live-session join link status."
              variant={settingsMap.live_session_url ? 'success' : 'warning'}
              to="/dashboard/settings/app"
            />
            <StatCard
              label="Batch Links"
              value={configuredBatchKeys}
              hint="Configured D1/D2 batch watch links."
              to="/dashboard/settings/app"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Content & Settings</CardTitle>
                <CardDescription>High-trust content rails and system setup shortcuts.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <DeskShortcut
                  to="/dashboard/settings/app"
                  title="General settings"
                  description="Min. FLP Billing video, live session, and batch links."
                  icon={<Settings className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/system/training"
                  title="Training control"
                  description="Review the admin training program configuration."
                  icon={<GraduationCap className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/other/live-session"
                  title="Live session page"
                  description="Check the member-facing live-session surface."
                  icon={<Video className="size-4" />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuration Readiness</CardTitle>
                <CardDescription>Plain status so admin can see what is configured at a glance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[

                  ['Public app URL', settingsMap.public_app_url],
                  ['Live session join link', settingsMap.live_session_url],
                ].map(([label, value]) => (
                  <div key={label} className="surface-inset flex items-center justify-between gap-3 rounded-md p-4">
                    <div>
                      <p className="font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{value ? 'Configured' : 'Missing'}</p>
                    </div>
                    <Badge variant={value ? 'success' : 'warning'}>{value ? 'Ready' : 'Needs setup'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="premiere" className="space-y-6">
          {/* Top stats — all 3 days combined */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              label="Total Attendees Today"
              value={(premiereViewers.data ?? []).length}
              hint="Unique viewers across Day 1, Day 2, Day 3 live sessions."
            />
            <StatCard
              label="Watching Now"
              value={(premiereViewers.data ?? []).filter((v) => isActiveNow(v.last_seen_at)).length}
              hint="Active in last 45 seconds."
              variant={(premiereViewers.data ?? []).some((v) => isActiveNow(v.last_seen_at)) ? 'danger' : 'default'}
            />
            <StatCard
              label="Completed"
              value={(premiereViewers.data ?? []).filter((v) => v.watch_completed).length}
              hint="Marked watch complete."
              variant="success"
            />
          </section>

          {/* Date picker */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Video className="size-4 text-primary" />
                    Live Attendee History
                  </CardTitle>
                  <CardDescription>
                    {isHistoryToday
                      ? 'Live-updating view of today\'s Day 1/2/3 session attendees.'
                      : `Viewers from ${viewerHistoryDate}`}
                  </CardDescription>
                </div>
                <input
                  type="date"
                  value={viewerHistoryDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setViewerHistoryDate(e.target.value)}
                  className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </CardHeader>
            <CardContent>
              {premiereData.isPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="surface-inset h-16 rounded-md" />
                  ))}
                </div>
              ) : premiereData.isError ? (
                <ErrorState
                  title="Could not load viewers"
                  message={premiereData.error instanceof Error ? premiereData.error.message : 'Please try again.'}
                  onRetry={() => void premiereData.refetch()}
                />
              ) : (premiereData.data ?? []).length === 0 ? (
                <EmptyStatePremium
                  title="No attendees on this date"
                  description="No live session viewers found for the selected date."
                />
              ) : (
                <div className="space-y-6">
                  {([1, 2, 3] as const).map((day) => {
                    const dayViewers = (premiereData.data ?? []).filter((v) => v.session_day === day)
                    if (dayViewers.length === 0) return null

                    const dayLabel = day === 1 ? 'Calling Board — Day 1' : day === 2 ? 'Workboard — Day 2' : 'Workboard — Day 3'
                    const dayDesc = day === 1
                      ? 'Sent via calling board batch links'
                      : day === 2
                        ? 'Sent via workboard Send Day 2 Live'
                        : 'Sent via workboard Send Day 3 Live'
                    const liveCount = dayViewers.filter((v) => isActiveNow(v.last_seen_at)).length
                    const completedCount = dayViewers.filter((v) => v.watch_completed).length

                    return (
                      <section key={day}>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <h3 className="text-ds-h3 font-semibold text-foreground">{dayLabel}</h3>
                          <Badge variant="outline">{dayViewers.length} viewers</Badge>
                          {liveCount > 0 && (
                            <Badge variant="danger">
                              <span className="relative mr-1 flex size-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                              </span>
                              {liveCount} live
                            </Badge>
                          )}
                          {completedCount > 0 && (
                            <Badge variant="success">{completedCount} done</Badge>
                          )}
                        </div>
                        <p className="mb-3 text-ds-caption text-muted-foreground">{dayDesc}</p>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          {([17, 18, 19] as const).map((hour) => {
                            const slotName = hour === 17 ? '5pm' : hour === 18 ? '6pm' : '7pm'
                            const slotViewers = dayViewers.filter((v) => v.session_hour === hour)
                            return (
                              <div key={`d${day}-h${hour}`} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-ds-caption font-semibold text-muted-foreground">
                                    {slotName} slot
                                  </p>
                                  <span className="text-ds-label text-muted-foreground/70 tabular-nums">
                                    ({slotViewers.length})
                                  </span>
                                </div>
                                {slotViewers.length === 0 ? (
                                  <div className="surface-inset rounded px-3 py-3 text-center text-ds-caption text-muted-foreground/60">
                                    No viewers
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {slotViewers.map((v) => (
                                      <div key={v.viewer_id} className="surface-inset rounded px-3 py-2.5">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
                                              {isActiveNow(v.last_seen_at) && (
                                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                                                  <span className="relative flex size-1">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                                    <span className="relative inline-flex size-1 rounded-full bg-red-400" />
                                                  </span>
                                                  Live
                                                </span>
                                              )}
                                              {v.watch_completed && (
                                                <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                                                  Done
                                                </span>
                                              )}
                                              {v.rejoined && (
                                                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                                  Rejoined
                                                </span>
                                              )}
                                            </div>
                                            <p className="mt-0.5 truncate text-ds-caption text-muted-foreground">
                                              {v.masked_phone}
                                              {v.city ? ` · ${v.city}` : ''}
                                              {v.first_seen_at ? ` · Joined ${formatDateTime(v.first_seen_at)}` : ''}
                                            </p>
                                            <p className="mt-0.5 text-ds-label text-muted-foreground/70">
                                              Watched {v.percentage_watched}%{v.referred_by_name ? ` · Ref: ${v.referred_by_name}` : ''}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Session Schedule Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Session Schedule</CardTitle>
              <CardDescription>
                Day 1 via Calling Board · Day 2 & Day 3 via Workboard — all slots at 5pm, 6pm, 7pm IST.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {([
                  { day: 'Day 1', source: 'Calling Board', color: 'border-urgency-watch/30 bg-urgency-watch/[0.04]' },
                  { day: 'Day 2', source: 'Workboard', color: 'border-urgency-caution/30 bg-urgency-caution/[0.04]' },
                  { day: 'Day 3', source: 'Workboard (Live)', color: 'border-urgency-warning/30 bg-urgency-warning/[0.04]' },
                ]).map(({ day, source, color }) => (
                  <div key={day} className={`surface-inset rounded p-3 text-sm ${color}`}>
                    <p className="font-semibold text-foreground">{day}</p>
                    <p className="mt-0.5 text-ds-caption text-muted-foreground">{source}</p>
                    <p className="mt-1 text-ds-label text-muted-foreground/80">5pm · 6pm · 7pm</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <AdminActivityPanel />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="verification" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Verification Rate"
              value={vSummary.data ? `${vSummary.data.verification_rate_pct}%` : '...'}
              hint="Members with at least one evidence submission"
              variant={vSummary.data && vSummary.data.verification_rate_pct >= 50 ? 'success' : vSummary.data && vSummary.data.verification_rate_pct >= 20 ? 'warning' : 'danger'}
            />
            <StatCard
              label="Members Active Today"
              value={vSummary.data?.members_active_today ?? 0}
              hint="Members who submitted evidence today"
            />
            <StatCard
              label="Pending Verifications"
              value={vSummary.data?.pending_verifications ?? 0}
              hint="Tasks awaiting leader approval"
              variant="warning"
            />
            <StatCard
              label="Blocked Tasks"
              value={vSummary.data?.blocked_tasks ?? 0}
              hint="Tasks marked as blocked with reason"
              variant="danger"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leader Verification Ranking</CardTitle>
                <CardDescription>Leaders sorted by verified tasks. Red = high pending.</CardDescription>
              </CardHeader>
              <CardContent>
                {vSummary.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (vSummary.data?.leader_ranking ?? []).length === 0 ? (
                  <EmptyStatePremium variant="default" title="No data yet" description="Assign tasks to start tracking verification." />
                ) : (
                  <div className="space-y-2">
                    {(vSummary.data?.leader_ranking ?? []).map((l) => (
                      <div key={l.user_id} className="surface-inset flex items-center justify-between gap-3 rounded-md p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{l.name}</p>
                          <p className="text-xs text-muted-foreground">Team: {l.total_assigned}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{l.verified_count} verified</span>
                          <span className={`text-xs font-bold tabular-nums ${
                            l.verification_rate_pct >= 80 ? 'text-green-600' : l.verification_rate_pct >= 50 ? 'text-amber-600' : 'text-red-600'
                          }`}>{l.verification_rate_pct}%</span>
                          {l.total_assigned - l.verified_count > 5 && (
                            <ShieldAlert className="size-4 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                  <CardDescription>Create and assign verification tasks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DeskShortcut
                    to="#"
                    title="Create Task"
                    description="Define a new verification task"
                    icon={<ListChecks className="size-4" />}
                  />
                  <DeskShortcut
                    to="#"
                    title="Bulk Assign"
                    description="Assign a task to multiple members"
                    icon={<Users className="size-4" />}
                  />
                  <DeskShortcut
                    to="#"
                    title="Pending Review"
                    description={`${vSummary.data?.pending_verifications ?? 0} tasks awaiting verification`}
                    icon={<ClipboardCheck className="size-4" />}
                    badge={vSummary.data?.pending_verifications ?? 0}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Task Type Breakdown</CardTitle>
                  <CardDescription>Distribution of active task types</CardDescription>
                </CardHeader>
                <CardContent>
                  {(vSummary.data?.task_type_breakdown ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks created yet</p>
                  ) : (
                    <div className="space-y-2">
                      {vSummary.data?.task_type_breakdown.map((t) => (
                        <div key={t.task_type} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{t.task_type.toLowerCase().replace(/_/g, ' ')}</span>
                          <Badge variant="secondary">{t.count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="outcomes" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active Leads"
              value={outcomeSummary.data?.outcomes?.active ?? '...'}
              hint="In pipeline — being worked"
              variant="success"
            />
            <StatCard
              label="Converted"
              value={outcomeSummary.data?.outcomes?.converted ?? '...'}
              hint="Closed won"
              variant="default"
            />
            <StatCard
              label="Dead"
              value={outcomeSummary.data?.outcomes?.dead ?? '...'}
              hint="Closed lost"
              variant="danger"
            />
            <StatCard
              label="Recycle"
              value={outcomeSummary.data?.outcomes?.recycle ?? '...'}
              hint="Retarget / inactive — may re-engage"
              variant="warning"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Dead Lead Reasons</CardTitle>
                  <CardDescription>Per-member breakdown of why leads were lost</CardDescription>
                </div>
                <Badge variant="secondary">Known Zone Miss: {deadReasons.data?.members?.reduce((s, m) => s + (m.reasons?.known_zone_miss ?? 0), 0) ?? '?'}</Badge>
              </CardHeader>
              <CardContent>
                {deadReasons.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (deadReasons.data?.members ?? []).length === 0 ? (
                  <EmptyStatePremium variant="default" title="No dead leads" description="Dead leads with reasons will appear here." />
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {(deadReasons.data?.members ?? []).slice(0, 20).map((m) => (
                      <div key={m.user_id} className="surface-inset rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{m.name}</p>
                          <Badge variant="secondary">{m.total_dead}</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(m.reasons).map(([reason, count]) => (
                            <span key={reason} className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              reason === 'known_zone_miss' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                              reason === 'no_budget' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {reason.replace(/_/g, ' ')}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zombie Leads</CardTitle>
                <CardDescription>Active outcome but untouched for 7+ days</CardDescription>
              </CardHeader>
              <CardContent>
                {zombieLeads.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (zombieLeads.data?.leads ?? []).length === 0 ? (
                  <EmptyStatePremium variant="default" title="No zombies" description="All active leads have been touched recently." />
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {(zombieLeads.data?.leads ?? []).slice(0, 20).map((lead) => (
                      <div key={lead.id} className="surface-inset flex items-center justify-between rounded-md p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {lead.assigned_to_name ?? 'Unassigned'} · {lead.status}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-xs font-bold tabular-nums ${
                            (lead.days_inactive ?? 0) >= 14 ? 'text-red-600' : 'text-amber-600'
                          }`}>{lead.days_inactive}d</p>
                          <p className="text-[10px] text-muted-foreground">inactive</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recycle Leads</CardTitle>
                <CardDescription>Leads eligible for re-engagement</CardDescription>
              </CardHeader>
              <CardContent>
                {recycleLeads.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (recycleLeads.data?.leads ?? []).length === 0 ? (
                  <EmptyStatePremium variant="default" title="No recycle leads" description="Leads in recycle bucket will appear here." />
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(recycleLeads.data?.leads ?? []).slice(0, 15).map((lead) => (
                      <div key={lead.id} className="surface-inset flex items-center justify-between rounded-md p-3">
                        <div>
                          <p className="text-sm font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.assigned_to_name ?? 'Unassigned'}</p>
                          {lead.recycle_reason && (
                            <p className="text-[10px] text-muted-foreground">Reason: {lead.recycle_reason.replace(/_/g, ' ')}</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{lead.days_in_recycle ?? '?'}d ago</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Outcome Distribution</CardTitle>
                <CardDescription>Total: {outcomeSummary.data?.total ?? 0} leads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {outcomeSummary.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : (
                  <>
                    {(['active', 'converted', 'dead', 'recycle'] as const).map((oc) => {
                      const count = outcomeSummary.data?.outcomes?.[oc] ?? 0
                      const pct = outcomeSummary.data?.[`${oc}_pct` as keyof typeof outcomeSummary.data] as number ?? 0
                      const barColor = oc === 'active' ? 'bg-blue-500' : oc === 'converted' ? 'bg-green-500' : oc === 'dead' ? 'bg-red-500' : 'bg-amber-500'
                      return (
                        <div key={oc}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium capitalize">{oc}</span>
                            <span className="text-muted-foreground">{count} ({pct}%)</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-muted">
                            <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="missions" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Members Assigned"
              value={missionSummary.data?.assigned_today ?? 0}
              hint="Members with a mission today"
            />
            <StatCard
              label="Completed"
              value={missionSummary.data?.completed ?? 0}
              hint="Missions marked complete"
              variant="success"
            />
            <StatCard
              label="Pending"
              value={missionSummary.data?.pending ?? 0}
              hint="Missions not yet completed"
              variant="warning"
            />
            <StatCard
              label="Completion Rate"
              value={missionSummary.data ? `${missionSummary.data.completion_rate_pct}%` : '...'}
              hint="Overall completion rate"
              variant={missionSummary.data && missionSummary.data.completion_rate_pct >= 60 ? 'success' : missionSummary.data && missionSummary.data.completion_rate_pct >= 20 ? 'warning' : 'danger'}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leader Breakdown</CardTitle>
                <CardDescription>Mission completion per leader's team</CardDescription>
              </CardHeader>
              <CardContent>
                {missionSummary.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (missionSummary.data?.leader_breakdown ?? []).length === 0 ? (
                  <EmptyStatePremium variant="default" title="No data yet" description="Create templates to start tracking daily missions." />
                ) : (
                  <div className="space-y-2">
                    {(missionSummary.data?.leader_breakdown ?? []).map((l) => (
                      <div key={l.user_id} className="surface-inset flex items-center justify-between gap-3 rounded-md p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{l.name}</p>
                          <p className="text-xs text-muted-foreground">Team: {l.team_size} · Assigned: {l.assigned}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{l.completed} done</span>
                          <span className={`text-xs font-bold tabular-nums ${
                            l.completion_rate_pct >= 60 ? 'text-green-600' : l.completion_rate_pct >= 20 ? 'text-amber-600' : 'text-red-600'
                          }`}>{l.completion_rate_pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <BlockerIntelligencePanel />
          </section>
        </TabsContent>

        <TabsContent value="effectiveness" className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Leaders Ranked"
              value={effectiveness.data?.total_leaders ?? 0}
              hint="Leaders with active teams"
            />
            <StatCard
              label="Avg Score"
              value={effectiveness.data ? `${effectiveness.data.average_score}` : '...'}
              hint="Organization-wide leader average"
              variant={effectiveness.data && effectiveness.data.average_score >= 60 ? 'success' : effectiveness.data && effectiveness.data.average_score >= 30 ? 'warning' : 'danger'}
            />
            <StatCard
              label="Elite"
              value={effectiveness.data?.band_distribution?.elite ?? 0}
              hint="Score ≥ 80"
              variant="success"
            />
            <StatCard
              label="Critical"
              value={effectiveness.data?.band_distribution?.critical ?? 0}
              hint="Score < 40 — needs intervention"
              variant={effectiveness.data && effectiveness.data.band_distribution?.critical > 0 ? 'danger' : 'default'}
            />
          </section>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="size-4 text-primary" />
                  Leader Effectiveness Ranking
                </CardTitle>
                <CardDescription>
                  5-component score: Mission (25%) · Verification (25%) · Conversion (20%) · Zombie (20%) · Blocker (10%)
                </CardDescription>
              </div>
              {effectiveness.data && (
                <Badge variant="secondary">Updated {new Date(effectiveness.data.computed_at).toLocaleTimeString()}</Badge>
              )}
            </CardHeader>
            <CardContent>
              {effectiveness.isPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : effectiveness.isError ? (
                <ErrorState
                  title="Could not load effectiveness"
                  message={effectiveness.error instanceof Error ? effectiveness.error.message : 'Please try again.'}
                  onRetry={() => effectiveness.refetch()}
                />
              ) : (effectiveness.data?.leaders ?? []).length === 0 ? (
                <EmptyStatePremium variant="default" title="No leader data" description="Leaders with team members will appear once they have activity." />
              ) : (
                <div className="space-y-4">
                  {effectiveness.data!.leaders.map((leader) => {
                    const { components } = leader
                    const bandColor = leader.band === 'elite' ? 'text-green-600' : leader.band === 'average' ? 'text-amber-600' : 'text-red-600'
                    const bandBg = leader.band === 'elite' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : leader.band === 'average' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    return (
                      <div key={leader.user_id} className="rounded-lg border border-border/60 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{leader.name}</p>
                            <Badge className={bandBg}>{leader.band}</Badge>
                            <span className="text-xs text-muted-foreground">{leader.team_size} members</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-2xl font-bold tabular-nums ${bandColor}`}>{leader.weighted_score}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                          {[
                            { key: 'mission_completion', label: 'Mission', value: components.mission_completion, pct: 25, weak: leader.weakest_component === 'Mission Completion' },
                            { key: 'verification_rate', label: 'Verification', value: components.verification_rate, pct: 25, weak: leader.weakest_component === 'Verification Rate' },
                            { key: 'conversion_rate', label: 'Conversion', value: components.conversion_rate, pct: 20, weak: leader.weakest_component === 'Conversion Rate' },
                            { key: 'zombie_lead_score', label: 'Zombie', value: components.zombie_lead_score, pct: 20, weak: leader.weakest_component === 'Zombie Leads' },
                            { key: 'blocker_resolution', label: 'Blocker', value: components.blocker_resolution, pct: 10, weak: leader.weakest_component === 'Blocker Resolution' },
                          ].map((bar) => {
                            const barColor = bar.value >= 80 ? 'bg-green-500' : bar.value >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            return (
                              <div key={bar.key} className={`rounded border p-2 ${bar.weak ? 'border-red-400/50 bg-red-50 dark:bg-red-950/20' : 'border-border/40'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-medium text-muted-foreground">{bar.label} ({bar.pct}%)</span>
                                  <span className={`text-xs font-bold tabular-nums ${bar.value >= 80 ? 'text-green-600' : bar.value >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{bar.value}</span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${bar.value}%` }} />
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Training Campaigns</h2>
              <p className="text-sm text-muted-foreground">Webinar → Mission → Verification → Metric</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/dashboard/system/training">Create Campaign</Link>
            </Button>
          </div>

          {campaignList.isPending ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : campaignList.isError ? (
            <ErrorState title="Failed to load" message="Could not load campaigns" onRetry={() => campaignList.refetch()} />
          ) : (campaignList.data ?? []).length === 0 ? (
            <EmptyStatePremium variant="default" title="No campaigns yet" description="Create a campaign after a webinar to track training implementation." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {campaignList.data!.map((camp) => (
                <Card key={camp.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold">{camp.name}</CardTitle>
                      <Badge variant="secondary">{camp.enrollment_count} enrolled</Badge>
                    </div>
                    {camp.description && (
                      <CardDescription className="line-clamp-2 text-xs">{camp.description}</CardDescription>
                    )}
                    {camp.webinar_date && (
                      <p className="text-[10px] text-muted-foreground">Webinar: {new Date(camp.webinar_date).toLocaleDateString()}</p>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CampaignMetricsMini campaignId={camp.id} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="History Rows"
              value={leadControl.data?.history_total ?? 0}
              hint="Auto + manual reassignment entries in the soft audit trail."
              to="/dashboard/system/lead-control"
            />
            <StatCard
              label="Receiving Members"
              value={leadControl.data?.history_summary.length ?? 0}
              hint="How many members have received reassigned leads."
              to="/dashboard/system/lead-control"
            />
            <StatCard
              label="Latest Manual"
              value={leadControl.data?.history?.find((row) => row.mode === 'manual') ? 'Yes' : 'No'}
              hint="Whether a manual reassignment exists in recent history."
              to="/dashboard/system/lead-control"
            />
            <StatCard
              label="Activity Log"
              value="Linked"
              hint="Full append-only activity log stays available as the deep audit page."
              to="/dashboard/analytics/activity-log"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit Rail</CardTitle>
                <CardDescription>Soft admin movement log here, full append-only activity log one click away.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <DeskShortcut
                  to="/dashboard/system/lead-control"
                  title="Reassignment audit"
                  description="Inspect the full reassignment queue and receiving summary."
                  icon={<ArrowRightLeft className="size-4" />}
                  badge={leadControl.data?.history_total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/analytics/activity-log"
                  title="Activity log"
                  description="Open the broader admin activity log surface."
                  icon={<FileDown className="size-4" />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Reassignment History</CardTitle>
                <CardDescription>Owner-safe movement history for sensitive reassignment review.</CardDescription>
              </CardHeader>
              <CardContent>
                {(leadControl.data?.history ?? []).length === 0 ? (
                  <EmptyStatePremium
                    variant="default"
                    title="No movement yet"
                    description="Auto and manual reassignment rows will appear here."
                  />
                ) : (
                  <div className="space-y-3">
                    {leadControl.data?.history.slice(0, 6).map((row) => (
                      <div key={row.activity_id} className="surface-inset rounded-md p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{row.lead_name}</p>
                          <Badge variant="outline">{row.mode === 'manual' ? 'Manual' : 'Auto'}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Owner {row.owner_name || 'Unknown'} · {formatDateTime(row.occurred_at)}
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {row.previous_assignee_name || 'Unassigned'} → {row.assigned_to_name || 'Unassigned'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Actor: {row.actor_name}
                          {row.reason ? ` · ${row.reason}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <RiskDashboard />
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          <AutomationPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
