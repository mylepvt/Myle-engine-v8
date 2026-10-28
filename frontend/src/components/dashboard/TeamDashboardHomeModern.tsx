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
import type { LeadPublic } from '@/hooks/use-leads-query'
import { stageBadgeClass } from '@/lib/stage-colors'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

type Props = {
  sessionReady: boolean
  recentLeads: LeadPublic[]
  handedOffLeads: LeadPublic[]
  handedOffPending: boolean
}

function humanizeStatus(status: string) {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function TeamDashboardHomeModern({
  sessionReady,
  recentLeads,
  handedOffLeads,
  handedOffPending,
}: Props) {
  // Today's numbers and the top shortcuts live at the top of Home (HomeTodayStrip).
  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 pb-2 md:max-w-3xl">
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
