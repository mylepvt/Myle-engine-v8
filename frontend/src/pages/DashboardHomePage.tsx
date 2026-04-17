import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, TrendingUp, UserPlus } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
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
import { useTeamTodayStatsQuery } from '@/hooks/use-team-today-stats-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { LEAD_STATUS_OPTIONS, type LeadPublic } from '@/hooks/use-leads-query'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { cn } from '@/lib/utils'

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

export function DashboardHomePage() {
  const { role } = useDashboardShellRole()
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const sessionReady = Boolean(me?.authenticated)

  const wb = useWorkboardQuery(sessionReady)
  /** Legacy team dashboard had no follow-up queue in nav; skip API for team. */
  const fu = useFollowUpsQuery(true, sessionReady && role !== 'team')
  const teamFunnel = useTeamPersonalFunnelQuery(sessionReady && role === 'team')
  const teamToday = useTeamTodayStatsQuery(sessionReady && role === 'team')
  const pool = useLeadPoolQuery(sessionReady)
  const adminReports = useTeamReportsQuery('', sessionReady && role === 'admin')

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
      if (c.status === 'converted' || c.status === 'won') won = t
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
        funnelPending={teamFunnel.isPending || teamFunnel.isError}
        today={teamToday.data}
        todayPending={teamToday.isPending}
        recentLeads={recentLeads}
        quickActions={quickActions}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.06]">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div>
            <CardTitle className="font-heading text-ds-h1 capitalize tracking-tight">
              Welcome, {firstName}!
            </CardTitle>
          </div>
          <div className="hidden shrink-0 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary sm:block">
            <TrendingUp className="size-10" strokeWidth={1.25} aria-hidden />
          </div>
        </CardHeader>
      </Card>

      {role === 'admin' && sessionReady ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {adminReports.isPending ? (
            <>
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <Skeleton className="mb-2 h-3 w-40" />
                  <Skeleton className="h-9 w-20" />
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <Skeleton className="mb-2 h-3 w-44" />
                  <Skeleton className="h-9 w-16" />
                </CardContent>
              </Card>
            </>
          ) : adminReports.isError ? (
            <Card className="border-destructive/30 sm:col-span-2">
              <CardContent className="pt-6 text-sm text-destructive" role="alert">
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
                className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-transparent transition-colors hover:border-amber-500/35">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Today&apos;s claimed leads
                      </p>
                      <UserPlus className="size-5 shrink-0 text-amber-400" aria-hidden />
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-amber-400">
                      {adminReports.data.live_summary.leads_claimed_today}
                    </p>
                    <p className="mt-1 text-ds-caption text-subtle">
                      Pool / ledger claims (IST day)
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link
                to="/dashboard/team/enrollment-approvals"
                className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent transition-colors hover:border-emerald-500/35">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Today&apos;s ₹196 approvals
                      </p>
                      <ClipboardCheck className="size-5 shrink-0 text-emerald-400" aria-hidden />
                    </div>
                    <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-emerald-400">
                      {adminReports.data.live_summary.payment_proofs_approved_today}
                    </p>
                    <p className="mt-1 text-ds-caption text-subtle">
                      Payment proofs approved today (IST)
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {role !== 'admin' ? <GateAssistantCard sessionReady={sessionReady} /> : null}

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
        <h2 className="mb-3 font-heading text-ds-h2 text-foreground">
          Overview
        </h2>
        {kpiLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-primary/20">
                <CardContent className="pt-6">
                  <Skeleton className="mb-2 h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link
              to="/dashboard/work/workboard"
              className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-blue-500/20 bg-gradient-to-br from-blue-500/[0.08] to-transparent transition-colors hover:border-blue-500/35">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Active leads
                    </p>
                    <TrendingUp className="size-4 shrink-0 text-blue-400/70" aria-hidden />
                  </div>
                  <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-blue-400">
                    {metrics.activeTotal}
                  </p>
                  <p className="mt-1 text-ds-caption text-subtle">
                    In your scope · open workboard
                  </p>
                </CardContent>
              </Card>
            </Link>
            {role === 'admin' || role === 'leader' ? (
              <Link
                to="/dashboard/work/follow-ups"
                className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-transparent transition-colors hover:border-amber-500/35">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Open follow-ups
                      </p>
                      {openFollowUps > 0 && (
                        <span className="text-xs font-semibold text-amber-400" aria-hidden>↑</span>
                      )}
                    </div>
                    <p className={cn('mt-2 font-heading text-3xl font-bold tabular-nums', openFollowUps > 0 ? 'text-amber-400' : 'text-muted-foreground')}>
                      {openFollowUps}
                    </p>
                    <p className="mt-1 text-ds-caption text-subtle">
                      Not completed · open queue
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : role === 'team' ? (
              <Link
                to="/dashboard/other/live-session"
                className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Card className="h-full border-primary/20 transition-colors hover:border-primary/35">
                  <CardContent className="pt-6">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Live session
                    </p>
                    <p className="mt-2 font-heading text-lg font-semibold text-foreground">Join link and schedule</p>
                    <p className="mt-1 text-ds-caption text-subtle">
                      Same as legacy zoom block — opens Live Session page
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                    Open follow-ups
                  </p>
                  <p className="mt-1 text-ds-caption text-subtle">Sign in to see your workspace.</p>
                </CardContent>
              </Card>
            )}
            <Link
              to="/dashboard/work/leads"
              className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent transition-colors hover:border-emerald-500/35">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Converted
                    </p>
                    {metrics.winRatePct !== null && (
                      <span className={cn('text-xs font-semibold', metrics.won > 0 ? 'text-emerald-400' : 'text-muted-foreground')} aria-hidden>
                        {metrics.won > 0 ? '↑' : '—'} {metrics.winRatePct}%
                      </span>
                    )}
                  </div>
                  <p className={cn('mt-2 font-heading text-3xl font-bold tabular-nums', metrics.won > 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                    {metrics.won}
                  </p>
                  <p className="mt-1 text-ds-caption text-subtle">
                    {metrics.winRatePct !== null ? `Win rate ${metrics.winRatePct}%` : 'No closed outcomes yet'}
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link
              to="/dashboard/work/leads"
              className="block rounded-xl no-underline outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2"
            >
              <Card className="h-full border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent transition-colors hover:border-violet-500/35">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
                      New leads
                    </p>
                    {metrics.newLeads > 0 && (
                      <span className="text-xs font-semibold text-violet-400/70" aria-hidden>↑</span>
                    )}
                  </div>
                  <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-violet-400">
                    {metrics.newLeads}
                  </p>
                  <p className="mt-1 text-ds-caption text-subtle">
                    New lead stage · open list
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-ds-h3">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-2 lg:grid-cols-3">
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
                {recentLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {mePending && !me ? (
        <div className="flex justify-center py-8">
          <LoadingState label="Loading session…" />
        </div>
      ) : null}
    </div>
  )
}
