import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { TodayLeaderboardCard } from '@/components/xp/TodayLeaderboardCard'
import { WinsFeedCard } from '@/components/wins/WinsFeedCard'
import { ControlRoomCard } from '@/components/control-room/ControlRoomCard'
import { XpBadge } from '@/components/xp/XpBadge'
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
import { useHandedOffLeadsQuery } from '@/hooks/use-handed-off-leads-query'
import { useTeamTodayStatsQuery } from '@/hooks/use-team-today-stats-query'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { LEAD_STATUS_OPTIONS, type LeadPublic, type LeadStatus, usePatchLeadMutation } from '@/hooks/use-leads-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { usePingLoginMutation } from '@/hooks/use-xp-query'
import { VerificationHomePanel } from '@/components/dashboard/VerificationHomePanel'
import { CampaignProgressCard } from '@/components/dashboard/CampaignProgressCard'
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

const isToday = (iso: string | null | undefined) =>
  !!iso && new Date(iso).toDateString() === new Date().toDateString()

const touchedAt = (l: LeadPublic) => new Date(l.last_action_at ?? l.created_at).getTime()

/** Leads added or worked today — the home screen is about today; "View all" is the history. */
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
    .filter((l) => isToday(l.created_at) || isToday(l.last_action_at))
    .sort((a, b) => touchedAt(b) - touchedAt(a))
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
              <span key={s} className="flex items-center gap-0.5 text-ds-micro text-success-ink/80">
                <CheckCircle2 className="size-3.5" />
              </span>
            ))}
            <span className="ml-1 text-ds-caption text-muted-foreground">Pre-Day 1 ✓</span>
          </div>

          <span className="text-muted-foreground">|</span>

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
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-ds-micro font-medium transition disabled:opacity-50',
                    checked
                      ? 'border-success/40 bg-success/12 text-success-ink dark:border-success/40 dark:bg-success/12'
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



export function DashboardHomePage() {
  const { role } = useDashboardShellRole()
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const sessionReady = Boolean(me?.authenticated)
  const patchLead = usePatchLeadMutation()

  const wb = useWorkboardQuery(sessionReady)
  /** Legacy team dashboard had no follow-up queue in nav; skip API for team. */
  const teamToday = useTeamTodayStatsQuery(sessionReady && role === 'team')
  const handedOffLeads = useHandedOffLeadsQuery(sessionReady && role === 'team')
  const pool = useLeadPoolQuery(sessionReady && role === 'admin')
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

  const recentLeads = useMemo(
    () => recentFromWorkboard(wb.data?.columns),
    [wb.data?.columns],
  )

  const poolTotal = pool.data?.total ?? 0

  const quickActions = useMemo(() => {
    if (role == null) return []
    return getHomeQuickActions(role, { poolTotal })
  }, [role, poolTotal])

  if (role === 'team' && sessionReady) {
    return (
      <TeamDashboardHomeModern
        sessionReady={sessionReady}
        firstName={firstName}
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

      {role === 'leader' ? <ControlRoomCard /> : null}

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


      {role === 'team' || role === 'leader' ? <VerificationHomePanel /> : null}

      <CcSummaryCard enabled={sessionReady} />

      <Card>
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

      <XpBadge />

      <WinsFeedCard />
      <TodayLeaderboardCard />

      <CollapsibleSection title="Today's Leads" defaultOpen={false}>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-ds-h3">Today's leads</CardTitle>
              <CardDescription>
                Added or worked on today
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
                No leads added or worked on today yet. Open{' '}
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
