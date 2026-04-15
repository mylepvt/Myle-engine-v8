import { Link } from 'react-router-dom'
import { ArrowRight, Briefcase, FileCheck, IndianRupee, Phone, Video } from 'lucide-react'

import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { HomeQuickAction } from '@/config/dashboard-home-actions'
import type { LeadPublic } from '@/hooks/use-leads-query'
import type { TeamPersonalFunnel } from '@/hooks/use-team-personal-funnel-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'

type Props = {
  sessionReady: boolean
  firstName: string
  funnel: TeamPersonalFunnel | undefined
  funnelPending: boolean
  today: TeamTodayStats | undefined
  todayPending: boolean
  recentLeads: LeadPublic[]
  quickActions: HomeQuickAction[]
}

function statCards(
  funnel: TeamPersonalFunnel | undefined,
  today: TeamTodayStats | undefined,
): { label: string; value: number; sub: string; Icon: typeof Briefcase; accent: string }[] {
  return [
    {
      label: 'Claimed',
      value: today?.claimed_today ?? 0,
      sub: 'Today',
      Icon: Briefcase,
      accent: 'text-foreground',
    },
    {
      label: 'Calls',
      value: today?.calls_today ?? 0,
      sub: 'Today',
      Icon: Phone,
      accent: 'text-primary',
    },
    {
      label: 'Video Reached',
      value: funnel?.video_reached ?? 0,
      sub: 'From assigned',
      Icon: Video,
      accent: 'text-indigo-400',
    },
    {
      label: 'Proof Pending',
      value: funnel?.proof_pending ?? 0,
      sub: 'Awaiting review',
      Icon: FileCheck,
      accent: 'text-muted-foreground',
    },
    {
      label: 'Paid 196',
      value: funnel?.paid_196 ?? 0,
      sub: 'Enrolled',
      Icon: IndianRupee,
      accent: 'text-emerald-400',
    },
  ]
}

export function TeamDashboardHomeModern({
  sessionReady,
  firstName,
  funnel,
  funnelPending,
  today,
  todayPending,
  recentLeads,
  quickActions,
}: Props) {
  const loading = funnelPending || todayPending
  const cards = statCards(funnel, today)
  const topActions = quickActions.slice(0, 4)

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06]">
        <CardContent className="px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Hi, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team dashboard</p>
        </CardContent>
      </Card>

      <GateAssistantCard sessionReady={sessionReady} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold text-foreground">Enrollment Funnel</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Assigned active
          </span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {cards.map((c) => (
              <Card
                key={c.label}
                className="min-w-[140px] border-border/70 bg-card/95 shadow-sm transition hover:border-primary/35"
              >
                <CardContent className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <c.Icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-[10px] font-semibold text-muted-foreground">{c.sub}</span>
                  </div>
                  <p className={`text-3xl font-semibold tabular-nums ${c.accent}`}>{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-base font-semibold text-foreground">Quick Actions</h2>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {topActions.map((a) => (
            <Link
              key={a.path}
              to={a.to}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <a.Icon className="size-4 shrink-0 text-primary" aria-hidden />
              <span>{a.label}</span>
              {a.badgeCount != null ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {a.badgeCount}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold text-foreground">Recent Leads</h2>
          <Link to="/dashboard/work/leads" className="text-xs font-semibold text-primary">
            View all
          </Link>
        </div>
        <Card className="border-border/70 bg-card/95">
          <CardContent className="p-0">
            {recentLeads.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">No leads yet</p>
            ) : (
              recentLeads.slice(0, 5).map((l) => (
                <Link
                  key={l.id}
                  to={`/dashboard/work/leads/${l.id}`}
                  className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.status.replaceAll('_', ' ')}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
