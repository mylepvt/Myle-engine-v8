import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Banknote,
  BellRing,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileDown,
  FileText,
  GraduationCap,
  Layers3,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Video,
  Wallet,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppSettingsQuery, useSystemUsersSummaryQuery } from '@/hooks/use-settings-query'
import { useDay2ReviewQuery } from '@/hooks/use-day2-review-query'
import { useActiveWatchersQuery } from '@/hooks/use-enroll-query'
import { useEnrollmentApprovalsPendingQuery, useTeamMembersQuery, useUpdateMemberComplianceMutation, type TeamMemberPublic } from '@/hooks/use-team-query'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useWalletRechargeRequestsQuery } from '@/hooks/use-wallet-recharge-query'
import { useInvoicesQuery } from '@/hooks/use-invoices-query'
import { useLeadControlQuery } from '@/hooks/use-lead-control-query'
import { LEAD_STATUS_OPTIONS, useLeadsQuery, type LeadPublic } from '@/hooks/use-leads-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { apiFetch, apiUrl } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

type Props = {
  firstName: string
}

type PremiereViewerRow = {
  viewer_id: string
  name: string
  masked_phone: string
  city: string
  session_date: string
  session_hour: number
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

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
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

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(messageFromApiErrorPayload(body, `HTTP ${response.status}`))
  }
  return body as T
}

type StatVariant = 'default' | 'warning' | 'success' | 'danger'

const STAT_VARIANT_STYLES: Record<StatVariant, { border: string; bg: string; value: string }> = {
  default: {
    border: 'border-t-primary/40',
    bg: 'from-primary/[0.05]',
    value: 'text-foreground',
  },
  warning: {
    border: 'border-t-amber-400/50',
    bg: 'from-amber-400/[0.06]',
    value: 'text-amber-300',
  },
  success: {
    border: 'border-t-emerald-400/50',
    bg: 'from-emerald-400/[0.06]',
    value: 'text-emerald-300',
  },
  danger: {
    border: 'border-t-red-400/50',
    bg: 'from-red-400/[0.06]',
    value: 'text-red-300',
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
  const cls = `border-t-2 bg-gradient-to-b to-transparent ${styles.border} ${styles.bg}`
  const inner = (
    <CardContent className="space-y-2.5 p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`font-heading text-[2rem] font-bold leading-none tabular-nums ${styles.value}`}>{value}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </CardContent>
  )
  if (to) return <CardLink to={to} className={cls}>{inner}</CardLink>
  return <Card className={cls}>{inner}</Card>
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
      className="group flex items-center gap-3.5 rounded-[1.1rem] border border-border/60 bg-card/40 p-3.5 no-underline transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-[0_4px_16px_-4px_rgba(84,101,255,0.14)]"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-primary ring-1 ring-border/40 transition-colors duration-200 group-hover:bg-primary/[0.08] group-hover:ring-primary/30">
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

function LeadResultRow({ lead }: { lead: LeadPublic }) {
  return (
    <div className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
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

function GraceRequestRow({ member }: { member: TeamMemberPublic }) {
  const mut = useUpdateMemberComplianceMutation()
  const busy = mut.isPending

  function act(action: 'approve_grace_request' | 'reject_grace_request') {
    mut.mutate({ userId: member.id, action, graceEndDate: null, reason: null })
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.1rem] border border-border/60 bg-card/40 p-3.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {member.username ?? member.fbo_id}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{member.fbo_id}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Till {member.grace_request_end_date ? new Date(member.grace_request_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          {member.grace_request_reason ? ` · ${member.grace_request_reason}` : ''}
        </p>
        {mut.isError && (
          <p className="text-xs text-destructive">{(mut.error as Error).message}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-400/10"
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

export function AdminCommandCenter({ firstName }: Props) {
  const [activeTab, setActiveTab] = useState('today')
  const [leadSearch, setLeadSearch] = useState('')
  const deferredLeadSearch = useDeferredValue(leadSearch.trim())
  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [viewerHistoryDate, setViewerHistoryDate] = useState<string>(todayIST)

  const pendingRegistrations = useQuery({
    queryKey: ['team', 'pending-registrations'],
    queryFn: () => fetchJson<PendingRegistrationResponse>('/api/v1/team/pending-registrations'),
  })
  const enrollmentPending = useEnrollmentApprovalsPendingQuery()
  const rechargeRequests = useWalletRechargeRequestsQuery()
  const leadControl = useLeadControlQuery()
  const leadPool = useLeadPoolQuery(true)
  const teamReports = useTeamReportsQuery('', true)
  const activeWatchers = useActiveWatchersQuery(activeTab === 'today')

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
  const day2Review = useDay2ReviewQuery()
  const premiereViewers = usePremiereViewersQuery(true)
  const isHistoryToday = viewerHistoryDate === todayIST
  const premiereHistory = usePremiereViewersQuery(activeTab === 'premiere' && !isHistoryToday, viewerHistoryDate)
  // Today's history = already-loaded premiereViewers; past dates = premiereHistory
  const historyData = isHistoryToday ? premiereViewers : premiereHistory
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

  const liveSummary = teamReports.data?.live_summary
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-[#eef0ff] via-[#f4f6ff] to-[#fafaff] px-6 py-8 dark:border-white/[0.07] dark:from-[#0d0d14] dark:via-[#0e0d18] dark:to-[#0a0b11] md:px-8">
        <div className="pointer-events-none absolute -top-24 right-0 size-80 rounded-full bg-primary/[0.22] blur-3xl dark:bg-primary/[0.18]" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 size-48 rounded-full bg-violet-400/[0.12] blur-2xl dark:bg-primary/[0.08]" />
        <div className="pointer-events-none absolute left-0 top-0 size-40 rounded-full bg-blue-300/[0.18] blur-2xl dark:hidden" />
        <div className="relative space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Admin Command Center</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Good day, {firstName}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            One operational surface for today&apos;s queues, universal lead jump, team controls, finance checkpoints,
            content readiness, and audit visibility.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {pendingTotal > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-4 py-1.5 text-sm shadow-sm dark:border-amber-400/20 dark:bg-amber-400/[0.07] dark:shadow-none">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
                </span>
                <span className="font-bold text-amber-700 dark:text-amber-200">{pendingTotal}</span>
                <span className="text-amber-600 dark:text-amber-300/70">pending actions</span>
              </div>
            )}
            {liveWatcherCount > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-red-400/40 bg-red-50 px-4 py-1.5 text-sm shadow-sm dark:border-red-400/20 dark:bg-red-500/[0.07] dark:shadow-none">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
                </span>
                <span className="font-bold text-red-700 dark:text-red-200">{liveWatcherCount}</span>
                <span className="text-red-600 dark:text-red-300/70">watching live</span>
              </div>
            )}
            {premiereActiveCount > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-red-400/40 bg-red-50 px-4 py-1.5 text-sm shadow-sm dark:border-red-400/20 dark:bg-red-500/[0.07] dark:shadow-none">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
                </span>
                <span className="font-bold text-red-700 dark:text-red-200">{premiereActiveCount}</span>
                <span className="text-red-600 dark:text-red-300/70">on premiere live</span>
              </div>
            )}
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-primary/15 pt-5 dark:border-white/[0.07]">
          <Button asChild variant="secondary" size="sm">
            <Link to="/dashboard/system/lead-control">Open lead control</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/dashboard/system/day2-review">Open Day 2 review</Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-2xl bg-muted/40 p-2">
          <TabsTrigger value="today" className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Today
            {pendingTotal > 0 && (
              <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {pendingTotal}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-1.5">
            <Search className="size-3.5" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="premiere" className="flex items-center gap-1.5">
            <Video className="size-3.5" />
            Premiere
            {liveWatcherCount > 0 && (
              <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                {liveWatcherCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            Team
            {pendingGraceCount > 0 && (
              <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {pendingGraceCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="finance" className="flex items-center gap-1.5">
            <Wallet className="size-3.5" />
            Finance
            {pendingRechargeItems.length > 0 && (
              <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {pendingRechargeItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-1.5">
            <Settings className="size-3.5" />
            Content
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Pending Registrations"
              value={pendingRegistrations.data?.total ?? 0}
              hint="Self-serve signups waiting for admin approval."
              variant="warning"
              to="/dashboard/team/approvals"
            />
            <StatCard
              label="Min. FLP Billing"
              value={enrollmentPending.data?.total ?? 0}
              hint="Min. FLP billing approvals pending review right now."
              variant="warning"
              to="/dashboard/team/enrollment-approvals"
            />
            <StatCard
              label="Recharge Requests"
              value={pendingRechargeItems.length}
              hint="Wallet requests still waiting for finance approval."
              variant="warning"
              to="/dashboard/finance/recharge-admin"
            />
            <StatCard
              label="Grace Requests"
              value={pendingGraceCount}
              hint="Team members with a pending grace period request awaiting review."
              variant={pendingGraceCount > 0 ? 'warning' : 'default'}
              to="/dashboard/team/members"
            />
            <StatCard
              label="Reassign Ready"
              value={leadControl.data?.queue_total ?? 0}
              hint="Archived watch leads already eligible for redistribution."
              to="/dashboard/system/lead-control"
            />
            <StatCard
              label="Archive Incubation"
              value={leadControl.data?.incubation_total ?? 0}
              hint="Archived watch leads still counting down toward stale reassignment."
              to="/dashboard/system/lead-control"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BellRing className="size-4" />
                  Today Queue
                </CardTitle>
                <CardDescription>Priority approvals and movement queues without jumping across the app.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <DeskShortcut
                  to="/dashboard/team/approvals"
                  title="Pending registrations"
                  description="Approve or reject newly registered users."
                  icon={<Users className="size-4" />}
                  badge={pendingRegistrations.data?.total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/team/enrollment-approvals"
                  title="Min. FLP Billing"
                  description="Review minimum FLP billing proofs and keep the funnel moving."
                  icon={<ClipboardCheck className="size-4" />}
                  badge={enrollmentPending.data?.total ?? 0}
                />
                <DeskShortcut
                  to="/dashboard/finance/recharge-admin"
                  title="Recharge requests"
                  description="Approve or reject pending wallet recharges."
                  icon={<Wallet className="size-4" />}
                  badge={pendingRechargeItems.length}
                />
                <DeskShortcut
                  to="/dashboard/team/members"
                  title="Grace requests"
                  description="Review and approve or reject pending grace period requests from team members."
                  icon={<Clock className="size-4" />}
                  badge={pendingGraceCount}
                />
                <DeskShortcut
                  to="/dashboard/system/lead-control"
                  title="Reassignment queue"
                  description="Move stale archived watch leads without changing ownership."
                  icon={<ArrowRightLeft className="size-4" />}
                  badge={leadControl.data?.queue_total ?? 0}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Today Snapshot</CardTitle>
                <CardDescription>Fast operational pulse for the current admin day.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Claimed today</p>
                  <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">{liveSummary?.leads_claimed_today ?? 0}</p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approved today</p>
                  <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">
                    {liveSummary?.payment_proofs_approved_today ?? 0}
                  </p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lead pool visible</p>
                  <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums text-foreground">{leadPool.data?.total ?? 0}</p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
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

          <Card className="surface-elevated border-white/[0.08]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                </span>
                Live Right Now
              </CardTitle>
              <CardDescription>Prospects actively watching enrollment videos — refreshes every 15 seconds.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeWatchers.isPending ? (
                <div className="space-y-2">
                  <div className="surface-inset h-14 animate-pulse rounded-2xl" />
                  <div className="surface-inset h-14 animate-pulse rounded-2xl" />
                </div>
              ) : activeWatchers.isError ? (
                <ErrorState
                  title="Could not load live viewers"
                  message={activeWatchers.error instanceof Error ? activeWatchers.error.message : 'Please try again.'}
                  onRetry={() => void activeWatchers.refetch()}
                />
              ) : (activeWatchers.data?.items ?? []).length === 0 ? (
                <EmptyState
                  title="No one watching right now"
                  description="Active viewers will appear here within 15 seconds of opening their private room."
                />
              ) : (
                <div className="space-y-3">
                  {(activeWatchers.data?.items ?? []).map((watcher) => (
                    <div key={`${watcher.lead_id}-${watcher.last_seen_at}`} className="surface-inset rounded-2xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{watcher.viewer_name || watcher.lead_name}</p>
                            <Badge variant={watcher.watch_completed ? 'success' : 'outline'}>
                              {watcher.watch_completed ? 'Watch completed' : 'Watching now'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Lead: {watcher.lead_name}
                            {watcher.viewer_phone ? ` · ${watcher.viewer_phone}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {watcher.started_at ? `Started ${formatDateTime(watcher.started_at)} · ` : ''}
                            Last seen {formatDateTime(watcher.last_seen_at)}
                          </p>
                          {watcher.unlocked_at ? (
                            <p className="text-xs text-muted-foreground">
                              Verified {formatDateTime(watcher.unlocked_at)}
                            </p>
                          ) : null}
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                          </span>
                          Watching now
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                  className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/40"
                />
              </label>
              {deferredLeadSearch.length === 0 ? (
                <EmptyState
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
                <EmptyState
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

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead Desk</CardTitle>
                <CardDescription>Everything admin needs for movement and storage, without hunting through nav.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
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

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Day 2 Review Wall</CardTitle>
                <CardDescription>Recent notes, voice notes, and videos from Day 2 without mixing them into reassignment.</CardDescription>
              </CardHeader>
              <CardContent>
                {day2Review.isError ? (
                  <ErrorState
                    title="Day 2 review failed"
                    message={day2Review.error instanceof Error ? day2Review.error.message : 'Please try again.'}
                    onRetry={() => void day2Review.refetch()}
                  />
                ) : (day2Review.data?.submissions ?? []).length === 0 ? (
                  <EmptyState
                    title="No Day 2 submissions yet"
                    description="New uploads will show here as soon as leads submit them."
                  />
                ) : (
                  <div className="space-y-3">
                    {day2Review.data?.submissions.slice(0, 4).map((submission) => (
                      <div key={submission.submission_id} className="surface-inset rounded-2xl p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{submission.lead_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {submission.slot.replace(/_/g, ' ')} · {formatDateTime(submission.submitted_at)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Owner {submission.owner_name} · Assignee {submission.assigned_to_name}
                            </p>
                          </div>
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/dashboard/work/leads/${submission.lead_id}`}>Open lead</Link>
                          </Button>
                        </div>
                        {submission.notes_text_preview ? (
                          <p className="mt-3 text-sm text-foreground/90">{submission.notes_text_preview}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Member Desk</CardTitle>
                <CardDescription>Role, compliance, password reset, access lock, and training live in one admin member surface.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
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
                  <EmptyState
                    title="No urgent member flags"
                    description="Training locks, access blocks, and compliance warnings will surface here."
                  />
                ) : (
                  <div className="space-y-3">
                    {flaggedMembers.map((member) => (
                      <div key={member.id} className="surface-inset flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4">
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
          </section>
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Finance Desk</CardTitle>
                <CardDescription>Recharge approvals, invoices, and budget hierarchy from one place.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <DeskShortcut
                  to="/dashboard/finance/recharge-admin"
                  title="Recharge requests"
                  description="Approve pending wallet deposits."
                  icon={<Wallet className="size-4" />}
                  badge={pendingRechargeItems.length}
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
                  <EmptyState title="No invoices yet" description="Recent invoice documents will show here." />
                ) : (
                  <div className="space-y-3">
                    {invoices.data?.items.map((invoice) => (
                      <div key={invoice.invoice_number} className="surface-inset rounded-2xl p-4">
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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Enrollment Video"
              value={settingsMap.enrollment_video_source_url ? 'Ready' : 'Missing'}
              hint="Secure enrollment video setup status."
              variant={settingsMap.enrollment_video_source_url ? 'success' : 'warning'}
              to="/dashboard/settings/app"
            />
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
            <StatCard
              label="Day 2 Items"
              value={day2Review.data?.total ?? 0}
              hint="Stored Day 2 submissions in the review wall."
              to="/dashboard/system/day2-review"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Content & Settings</CardTitle>
                <CardDescription>High-trust content rails and system setup shortcuts.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <DeskShortcut
                  to="/dashboard/settings/app"
                  title="General settings"
                  description="Enrollment video, live session, and batch links."
                  icon={<Settings className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/system/training"
                  title="Training control"
                  description="Review the admin training program configuration."
                  icon={<GraduationCap className="size-4" />}
                />
                <DeskShortcut
                  to="/dashboard/system/day2-review"
                  title="Day 2 review"
                  description="Open the full admin wall for notes, voice notes, and videos."
                  icon={<Video className="size-4" />}
                  badge={day2Review.data?.total ?? 0}
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
                  ['Enrollment room video', settingsMap.enrollment_video_source_url],
                  ['Enrollment room title', settingsMap.enrollment_video_title],
                  ['Public app URL', settingsMap.public_app_url],
                  ['Live session join link', settingsMap.live_session_url],
                ].map(([label, value]) => (
                  <div key={label} className="surface-inset flex items-center justify-between gap-3 rounded-2xl p-4">
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
          {/* Today's live stats — always-fresh */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Viewers Today"
              value={premiereViewers.data?.length ?? 0}
              hint="Unique registered viewers for today's premiere session."
              to="/dashboard/other/live-session"
            />
            <StatCard
              label="Watching Now"
              value={(premiereViewers.data ?? []).filter((v) => isActiveNow(v.last_seen_at)).length}
              hint="Active in last 45 seconds."
              variant={(premiereViewers.data ?? []).filter((v) => isActiveNow(v.last_seen_at)).length > 0 ? 'danger' : 'default'}
              to="/dashboard/other/live-session"
            />
            <StatCard
              label="Completed Session"
              value={(premiereViewers.data ?? []).filter((v) => v.watch_completed).length}
              hint="Watched 95%+ of the session."
              variant="success"
              to="/dashboard/other/live-session"
            />
            <StatCard
              label="Top Lead Score"
              value={(premiereViewers.data ?? []).reduce((max, v) => Math.max(max, v.lead_score), 0)}
              hint="Highest lead score from today's viewers."
              to="/dashboard/other/live-session"
            />
          </section>

          {/* Date picker + viewer history */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                    </span>
                    Viewer History
                  </CardTitle>
                  <CardDescription>
                    Date-wise viewer list with team member association. Refreshes live for today.
                  </CardDescription>
                </div>
                <input
                  type="date"
                  value={viewerHistoryDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setViewerHistoryDate(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </CardHeader>
            <CardContent>
              {historyData.isPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="surface-inset h-20 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : historyData.isError ? (
                <ErrorState
                  title="Could not load viewers"
                  message={historyData.error instanceof Error ? historyData.error.message : 'Please try again.'}
                  onRetry={() => void historyData.refetch()}
                />
              ) : (historyData.data ?? []).length === 0 ? (
                <EmptyState
                  title="No viewers on this date"
                  description="No one registered for a premiere session on this date."
                />
              ) : (
                <div className="space-y-2">
                  {(historyData.data ?? []).map((v) => (
                    <div key={`${v.viewer_id}-${v.session_hour}`} className="surface-inset rounded-2xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{v.name}</p>
                            {isActiveNow(v.last_seen_at) && (
                              <span className="flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                                <span className="relative flex size-1.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                  <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                                </span>
                                Live
                              </span>
                            )}
                            {v.watch_completed && <Badge variant="success">Completed</Badge>}
                            {v.rejoined && <Badge variant="outline">Rejoined</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {v.masked_phone} · {v.city}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Session {v.session_date} · {v.session_hour}:00
                            {v.first_seen_at ? ` · Joined ${formatDateTime(v.first_seen_at)}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Watched {v.percentage_watched.toFixed(1)}% · {fmtTime(v.current_time_sec)}
                          </p>
                          {v.referred_by_name && (
                            <p className="text-xs font-medium text-primary">
                              Team: {v.referred_by_name}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            Score {v.lead_score}
                          </span>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/70 transition-all"
                              style={{ width: `${Math.min(100, v.percentage_watched)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Scoring Guide</CardTitle>
              <CardDescription>How scores are computed for premiere viewers.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ['+10', 'Joined waiting room'],
                  ['+20', 'Watched 10+ minutes'],
                  ['+40', 'Watched 70%+'],
                  ['+30', 'Watched till end'],
                  ['+60', 'Rejoined session'],
                ] as const).map(([pts, label]) => (
                  <div key={label} className="surface-inset flex items-center gap-3 rounded-2xl p-3">
                    <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{pts}</span>
                    <p className="text-sm text-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit Rail</CardTitle>
                <CardDescription>Soft admin movement log here, full append-only activity log one click away.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
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
                  <EmptyState
                    title="No movement yet"
                    description="Auto and manual reassignment rows will appear here."
                  />
                ) : (
                  <div className="space-y-3">
                    {leadControl.data?.history.slice(0, 6).map((row) => (
                      <div key={row.activity_id} className="surface-inset rounded-2xl p-4">
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
      </Tabs>
    </div>
  )
}
