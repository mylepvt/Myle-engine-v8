import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Banknote,
  BellRing,
  ClipboardCheck,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppSettingsQuery, useSystemUsersSummaryQuery } from '@/hooks/use-settings-query'
import { useDay2ReviewQuery } from '@/hooks/use-day2-review-query'
import { useEnrollmentApprovalsPendingQuery, useTeamMembersQuery } from '@/hooks/use-team-query'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useWalletRechargeRequestsQuery } from '@/hooks/use-wallet-recharge-query'
import { useInvoicesQuery } from '@/hooks/use-invoices-query'
import { useLeadControlQuery } from '@/hooks/use-lead-control-query'
import { LEAD_STATUS_OPTIONS, useLeadsQuery, type LeadPublic } from '@/hooks/use-leads-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { useActiveWatchersQuery } from '@/hooks/use-enroll-query'
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
  percentage_watched: number
  current_time_sec: number
  last_seen_at: string | null
  lead_score: number
  watch_completed: boolean
  rejoined: boolean
}

async function fetchPremiereViewers(): Promise<PremiereViewerRow[]> {
  const res = await apiFetch('/api/v1/other/premiere/viewers')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(body, `HTTP ${res.status}`))
  return body as PremiereViewerRow[]
}

function usePremiereViewersQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['premiere', 'viewers'],
    queryFn: fetchPremiereViewers,
    enabled,
    refetchInterval: 15_000,
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <Card className="surface-elevated border-white/[0.08]">
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <p className="font-heading text-3xl text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
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
      className="surface-inset flex items-start justify-between gap-3 rounded-2xl p-4 no-underline transition hover:bg-white/[0.05]"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <p className="font-medium text-foreground">{title}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {badge != null ? (
        <span className="rounded-full border border-white/[0.1] px-2.5 py-1 text-xs text-foreground">{badge}</span>
      ) : null}
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

export function AdminCommandCenter({ firstName }: Props) {
  const [activeTab, setActiveTab] = useState('today')
  const [leadSearch, setLeadSearch] = useState('')
  const deferredLeadSearch = useDeferredValue(leadSearch.trim())

  const pendingRegistrations = useQuery({
    queryKey: ['team', 'pending-registrations'],
    queryFn: () => fetchJson<PendingRegistrationResponse>('/api/v1/team/pending-registrations'),
  })
  const enrollmentPending = useEnrollmentApprovalsPendingQuery()
  const rechargeRequests = useWalletRechargeRequestsQuery()
  const leadControl = useLeadControlQuery()
  const leadPool = useLeadPoolQuery(true)
  const teamReports = useTeamReportsQuery('', true)

  const systemUsersSummary = useSystemUsersSummaryQuery(activeTab === 'team')
  const teamMembers = useTeamMembersQuery(activeTab === 'team')
  const invoices = useInvoicesQuery({ limit: 5, offset: 0 }, activeTab === 'finance')
  const budgetSummary = useQuery({
    queryKey: ['finance', 'budget-export', 'command-center'],
    queryFn: () => fetchJson<BudgetSummaryResponse>('/api/v1/finance/budget-export?period=month'),
    enabled: activeTab === 'finance',
    staleTime: 30_000,
  })
  const appSettings = useAppSettingsQuery(activeTab === 'content')
  const day2Review = useDay2ReviewQuery()
  const premiereViewers = usePremiereViewersQuery(activeTab === 'premiere')
  const activeWatchers = useActiveWatchersQuery()
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary/80">Admin Command Center</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              Good day, {firstName}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              One operational surface for today&apos;s queues, universal lead jump, team controls, finance checkpoints,
              content readiness, and audit visibility.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/dashboard/system/lead-control">Open lead control</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/dashboard/system/day2-review">Open Day 2 review</Link>
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/50 p-2">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="premiere">Premiere</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Pending Registrations"
              value={pendingRegistrations.data?.total ?? 0}
              hint="Self-serve signups waiting for admin approval."
            />
            <StatCard
              label="Enroll Approvals"
              value={enrollmentPending.data?.total ?? 0}
              hint="Payment proofs pending review right now."
            />
            <StatCard
              label="Recharge Requests"
              value={pendingRechargeItems.length}
              hint="Wallet requests still waiting for finance approval."
            />
            <StatCard
              label="Reassign Ready"
              value={leadControl.data?.queue_total ?? 0}
              hint="Archived watch leads already eligible for redistribution."
            />
            <StatCard
              label="Archive Incubation"
              value={leadControl.data?.incubation_total ?? 0}
              hint="Archived watch leads still counting down toward stale reassignment."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="surface-elevated border-white/[0.08]">
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
                  title="Enroll approvals"
                  description="Review FLP invoices and keep the funnel moving."
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
                  to="/dashboard/system/lead-control"
                  title="Reassignment queue"
                  description="Move stale archived watch leads without changing ownership."
                  icon={<ArrowRightLeft className="size-4" />}
                  badge={leadControl.data?.queue_total ?? 0}
                />
              </CardContent>
            </Card>

            <Card className="surface-elevated border-white/[0.08]">
              <CardHeader>
                <CardTitle className="text-lg">Today Snapshot</CardTitle>
                <CardDescription>Fast operational pulse for the current admin day.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Claimed today</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{liveSummary?.leads_claimed_today ?? 0}</p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Approved today</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {liveSummary?.payment_proofs_approved_today ?? 0}
                  </p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Lead pool visible</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{leadPool.data?.total ?? 0}</p>
                </div>
                <div className="surface-inset rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest reassignment</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
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
                <EmptyState title="Could not load watchers" description="Refresh to try again." />
              ) : (activeWatchers.data ?? []).length === 0 ? (
                <EmptyState title="No one watching right now" description="Active viewers will appear here within 15 seconds of opening their private room." />
              ) : (
                <div className="space-y-3">
                  {(activeWatchers.data ?? []).map((watcher) => (
                    <div key={watcher.token} className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{watcher.lead_name}</p>
                          <span className="flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                            <span className="relative flex size-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                            </span>
                            Watching now
                          </span>
                          {watcher.watch_completed ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                              Completed
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {watcher.masked_phone}
                          {watcher.last_seen_at
                            ? ` · Last seen ${new Date(watcher.last_seen_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <a href={watcher.share_url} target="_blank" rel="noopener noreferrer">
                          Open room
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="space-y-6">
          <Card className="surface-elevated border-white/[0.08]">
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
                  className="w-full rounded-xl border border-white/[0.08] bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/40"
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
            <Card className="surface-elevated border-white/[0.08]">
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

            <Card className="surface-elevated border-white/[0.08]">
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
            <StatCard label="Total Users" value={systemUsersSummary.data?.total_users ?? 0} hint="Approved + pending + blocked users in the system summary." />
            <StatCard label="Leaders" value={systemUsersSummary.data?.by_role?.leader ?? 0} hint="Current approved leader seats." />
            <StatCard label="Team Members" value={systemUsersSummary.data?.by_role?.team ?? 0} hint="Current approved team execution layer." />
            <StatCard label="Blocked Users" value={systemUsersSummary.data?.blocked_users ?? 0} hint="Users currently blocked from normal access." />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="surface-elevated border-white/[0.08]">
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

            <Card className="surface-elevated border-white/[0.08]">
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
            <StatCard label="Visible Balance" value={formatInr(budgetSummary.data?.grand_totals.current_balance_cents ?? 0)} hint="Current visible wallet balance across the export view." />
            <StatCard label="Month Recharge" value={formatInr(budgetSummary.data?.grand_totals.period_recharge_cents ?? 0)} hint="Current month recharge volume." />
            <StatCard label="Month Spend" value={formatInr(budgetSummary.data?.grand_totals.period_spend_cents ?? 0)} hint="Current month spend volume." />
            <StatCard label="Pending Recharges" value={pendingRechargeItems.length} hint="Recharge approvals still pending." />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="surface-elevated border-white/[0.08]">
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

            <Card className="surface-elevated border-white/[0.08]">
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
            <StatCard label="Enrollment Video" value={settingsMap.enrollment_video_source_url ? 'Ready' : 'Missing'} hint="Secure enrollment video setup status." />
            <StatCard label="Live Session" value={settingsMap.live_session_url ? 'Ready' : 'Missing'} hint="Community live-session join link status." />
            <StatCard label="Batch Links" value={configuredBatchKeys} hint="Configured D1/D2 batch watch links." />
            <StatCard label="Day 2 Items" value={day2Review.data?.total ?? 0} hint="Stored Day 2 submissions in the review wall." />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="surface-elevated border-white/[0.08]">
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

            <Card className="surface-elevated border-white/[0.08]">
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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Viewers Today" value={premiereViewers.data?.length ?? 0} hint="Unique registered viewers for today's premiere session." />
            <StatCard label="Watching Now" value={(premiereViewers.data ?? []).filter((v) => isActiveNow(v.last_seen_at)).length} hint="Active in last 45 seconds." />
            <StatCard label="Completed Session" value={(premiereViewers.data ?? []).filter((v) => v.watch_completed).length} hint="Watched 95%+ of the session." />
            <StatCard label="Top Lead Score" value={(premiereViewers.data ?? []).reduce((max, v) => Math.max(max, v.lead_score), 0)} hint="Highest lead score from today's viewers." />
          </section>

          <Card className="surface-elevated border-white/[0.08]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                </span>
                Premiere Viewers — Today
              </CardTitle>
              <CardDescription>
                All registered viewers for today's session with watch progress and lead scores. Refreshes every 15s.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {premiereViewers.isPending ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="surface-inset h-20 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : premiereViewers.isError ? (
                <ErrorState
                  title="Could not load premiere viewers"
                  message={premiereViewers.error instanceof Error ? premiereViewers.error.message : 'Please try again.'}
                  onRetry={() => void premiereViewers.refetch()}
                />
              ) : (premiereViewers.data ?? []).length === 0 ? (
                <EmptyState
                  title="No viewers yet today"
                  description="Viewers appear here as soon as they register on the premiere page."
                />
              ) : (
                <div className="space-y-3">
                  {(premiereViewers.data ?? []).map((v) => (
                    <div key={v.viewer_id} className="surface-inset rounded-2xl p-4">
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
                            {v.watch_completed && (
                              <Badge variant="success">Completed</Badge>
                            )}
                            {v.rejoined && (
                              <Badge variant="outline">Rejoined</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {v.masked_phone} · {v.city}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Watched {v.percentage_watched.toFixed(1)}% · {fmtTime(v.current_time_sec)}
                            {v.last_seen_at ? ` · Last seen ${formatDateTime(v.last_seen_at)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            Score {v.lead_score}
                          </span>
                          {/* Progress bar */}
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
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

          <Card className="surface-elevated border-white/[0.08]">
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
            <StatCard label="History Rows" value={leadControl.data?.history_total ?? 0} hint="Auto + manual reassignment entries in the soft audit trail." />
            <StatCard label="Receiving Members" value={leadControl.data?.history_summary.length ?? 0} hint="How many members have received reassigned leads." />
            <StatCard label="Latest Manual" value={leadControl.data?.history?.find((row) => row.mode === 'manual') ? 'Yes' : 'No'} hint="Whether a manual reassignment exists in recent history." />
            <StatCard label="Activity Log" value="Linked" hint="Full append-only activity log stays available as the deep audit page." />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="surface-elevated border-white/[0.08]">
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

            <Card className="surface-elevated border-white/[0.08]">
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
