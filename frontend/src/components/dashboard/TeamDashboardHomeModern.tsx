import { Link } from 'react-router-dom'
import { ArrowRight, Clock3 } from 'lucide-react'

import { CcSummaryCard } from '@/components/dashboard/CcSummaryCard'
import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { HandedOffLeadsSection } from '@/components/dashboard/HandedOffLeadsSection'
import { PointsLeaderboardCard } from '@/components/rewards/PointsLeaderboardCard'
import { WinsFeedCard } from '@/components/wins/WinsFeedCard'
import { CommunityLiveCard } from '@/components/community/CommunityLiveCard'
import { RewardsCard } from '@/components/rewards/RewardsCard'
import { LevelCard } from '@/components/rewards/LevelCard'
import { Card, CardContent } from '@/components/ui/card'
import type { HomeQuickAction } from '@/config/dashboard-home-actions'
import type { LeadPublic } from '@/hooks/use-leads-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'
import { stageBadgeClass } from '@/lib/stage-colors'
import { cn, formatRelativeTimeShort } from '@/lib/utils'



type Props = {
  sessionReady: boolean
  firstName: string
  today: TeamTodayStats | undefined
  recentLeads: LeadPublic[]
  handedOffLeads: LeadPublic[]
  handedOffPending: boolean
  quickActions: HomeQuickAction[]
}

function greetingForCurrentTime() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function humanizeStatus(status: string) {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function TeamDashboardHomeModern({
  sessionReady,
  firstName,
  today,
  recentLeads,
  handedOffLeads,
  handedOffPending,
  quickActions,
}: Props) {
  const topActions = quickActions.slice(0, 4)
  const primaryAction = topActions[0]
  const secondaryActions = topActions.slice(1, 4)
  const greeting = greetingForCurrentTime()

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 pb-2 md:max-w-3xl">
      {/* Myle home header on theme tokens: greeting over the name, KPI cards, then actions. */}
      <section className="space-y-3">
        <div className="px-0.5">
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="mt-0.5 text-ds-h1 text-foreground">{firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep fresh leads moving, close follow-ups faster, and stay on the
            proof-ready queue.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Today's leads", value: today?.claimed_today ?? 0 },
            { label: 'Calls', value: today?.calls_today ?? 0 },
            { label: 'Min. FLP billed', value: today?.flp_min_billing_today ?? 0 },
          ].map((kpi) => (
            <div key={kpi.label} className="card flex flex-col justify-between p-3 sm:p-4">
              {/* Wraps to two lines on narrow phones rather than truncating. */}
              <p className="text-xs leading-snug text-muted-foreground sm:text-sm">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{kpi.value}</p>
            </div>
          ))}
        </div>

        {primaryAction ? (
          <Link
            to={primaryAction.to}
            className="btn-primary press group flex h-14 items-center justify-between gap-3 rounded-full pl-5 pr-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="sr-only">Primary action:</span>
              <primaryAction.Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate text-sm font-semibold">{primaryAction.label}</span>
            </span>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        ) : null}

        {secondaryActions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => (
              <Link
                key={action.path}
                to={action.to}
                className="btn-secondary press inline-flex min-h-[42px] items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold"
              >
                <action.Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{action.label}</span>
                {action.badgeCount != null ? (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-ds-micro text-primary">
                    {action.badgeCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <LevelCard />

      <RewardsCard />
      <CommunityLiveCard />
      <WinsFeedCard />
      <PointsLeaderboardCard />

      <GateAssistantCard sessionReady={sessionReady} />

      <CcSummaryCard enabled={sessionReady} />

      <HandedOffLeadsSection leads={handedOffLeads} pending={handedOffPending} />

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-semibold text-foreground">Today&apos;s Leads</h2>
            <p className="mt-1 text-ds-caption text-muted-foreground">
              Fresh records from your latest workboard activity.
            </p>
          </div>
          <Link to="/dashboard/work/leads" className="shrink-0 whitespace-nowrap text-ds-caption font-semibold text-primary">
            View all
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">No leads added or worked on today yet</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {recentLeads.slice(0, 5).map((lead) => (
              <Link
                key={lead.id}
                to={`/dashboard/work/leads/${lead.id}`}
                className="card card-interactive group block px-4 py-3.5 no-underline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-ds-caption text-muted-foreground">
                      <Clock3 className="size-3.5 shrink-0" aria-hidden />
                      <span>{formatRelativeTimeShort(lead.created_at)}</span>
                      {lead.source ? <span className="truncate">· {lead.source}</span> : null}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-ds-label font-semibold text-muted-foreground">
                    #{lead.id}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-ds-label font-semibold', stageBadgeClass(lead.status))}>
                      {humanizeStatus(lead.status)}
                    </span>
                    {lead.phone ? (
                      <span className="truncate text-ds-micro text-muted-foreground">{lead.phone}</span>
                    ) : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-ds-micro font-semibold text-primary">
                    Open
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
