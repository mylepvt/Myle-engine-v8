import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  Clock3,
  FileCheck,
  IndianRupee,
  Phone,
  Video,
} from 'lucide-react'

import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { XpBadge } from '@/components/xp/XpBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { HomeQuickAction } from '@/config/dashboard-home-actions'
import type { LeadPublic } from '@/hooks/use-leads-query'
import type { TeamPersonalFunnel } from '@/hooks/use-team-personal-funnel-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'



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
): {
  label: string
  value: number
  sub: string
  Icon: typeof Briefcase
  accent: string
  cardClass: string
  iconClass: string
}[] {
  return [
    {
      label: "Today's Leads",
      value: today?.claimed_today ?? 0,
      sub: 'Fresh today',
      Icon: Briefcase,
      accent: 'text-blue-400',
      cardClass:
        'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.12] via-blue-500/[0.05] to-transparent shadow-[0_18px_40px_-28px_rgba(37,99,235,0.8)] transition hover:border-blue-500/35',
      iconClass: 'text-blue-400/70',
    },
    {
      label: 'Calls',
      value: today?.calls_today ?? 0,
      sub: 'Today',
      Icon: Phone,
      accent: 'text-amber-400',
      cardClass:
        'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.12] via-amber-500/[0.04] to-transparent shadow-[0_18px_40px_-28px_rgba(245,158,11,0.75)] transition hover:border-amber-500/35',
      iconClass: 'text-amber-400/70',
    },
    {
      label: 'Video Reached',
      value: funnel?.video_reached ?? 0,
      sub: 'From assigned',
      Icon: Video,
      accent: 'text-indigo-400',
      cardClass:
        'border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.12] via-indigo-500/[0.04] to-transparent shadow-[0_18px_40px_-28px_rgba(99,102,241,0.8)] transition hover:border-indigo-500/35',
      iconClass: 'text-indigo-400/70',
    },
    {
      label: 'Proof Pending',
      value: funnel?.proof_pending ?? 0,
      sub: 'Awaiting review',
      Icon: FileCheck,
      accent: 'text-violet-400',
      cardClass:
        'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.12] via-violet-500/[0.04] to-transparent shadow-[0_18px_40px_-28px_rgba(139,92,246,0.8)] transition hover:border-violet-500/35',
      iconClass: 'text-violet-400/70',
    },
    {
      label: 'Min. FLP Billing',
      value: funnel?.paid_196 ?? 0,
      sub: 'Enrolled',
      Icon: IndianRupee,
      accent: 'text-emerald-400',
      cardClass:
        'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-emerald-500/[0.04] to-transparent shadow-[0_18px_40px_-28px_rgba(16,185,129,0.75)] transition hover:border-emerald-500/35',
      iconClass: 'text-emerald-400/70',
    },
  ]
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
  const primaryAction = topActions[0]
  const secondaryActions = topActions.slice(1, 4)
  const greeting = greetingForCurrentTime()
  const enrolledPct =
    funnel?.claimed && funnel.claimed > 0
      ? Math.round((funnel.paid_196 / funnel.claimed) * 100)
      : 0

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 pb-2">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(95,123,255,0.38),transparent_42%),linear-gradient(180deg,#111a35_0%,#0c1328_48%,#09111f_100%)] text-white shadow-[0_32px_80px_-44px_rgba(27,48,120,0.9)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div
          className="pointer-events-none absolute right-[-4.5rem] top-[-4rem] h-40 w-40 rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-28 w-28 rounded-full bg-cyan-300/15 blur-3xl"
          aria-hidden
        />

        <div className="relative space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-blue-100/70">
                {greeting}
              </p>
              <h1 className="mt-2 font-heading text-[1.9rem] font-semibold leading-none tracking-[-0.04em] text-white">
                {firstName}
              </h1>
              <p className="mt-2 max-w-[16rem] text-sm leading-6 text-blue-100/74">
                Keep fresh leads moving, close follow-ups faster, and stay on the
                proof-ready queue.
              </p>
            </div>

            <div className="shrink-0 rounded-[1.2rem] border border-white/10 bg-white/10 px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/68">
                Enrolled
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none text-white">
                {today?.enrolled_today ?? 0}
              </p>
              <p className="mt-1 text-[0.72rem] text-blue-100/70">
                {enrolledPct}% from claimed
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.08] px-3 py-3 backdrop-blur-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                Today&apos;s leads
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-white">
                {today?.claimed_today ?? 0}
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.08] px-3 py-3 backdrop-blur-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                Calls
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-white">
                {today?.calls_today ?? 0}
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.08] px-3 py-3 backdrop-blur-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                Proofs
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-white">
                {funnel?.proof_pending ?? 0}
              </p>
            </div>
          </div>

          {primaryAction ? (
            <Link
              to={primaryAction.to}
              className="group flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.14] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:bg-white/[0.18]"
            >
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                  Primary action
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <primaryAction.Icon
                    className="size-4 shrink-0 text-blue-100"
                    aria-hidden
                  />
                  <span className="truncate text-sm font-semibold text-white">
                    {primaryAction.label}
                  </span>
                </div>
              </div>
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-transform group-hover:translate-x-0.5">
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
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-2 text-xs font-semibold text-blue-50 transition hover:bg-white/[0.13]"
                >
                  <action.Icon
                    className="size-3.5 shrink-0 text-blue-100/90"
                    aria-hidden
                  />
                  <span>{action.label}</span>
                  {action.badgeCount != null ? (
                    <span className="rounded-full bg-white/12 px-1.5 py-0.5 text-[0.65rem] text-blue-50">
                      {action.badgeCount}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <XpBadge />

      <GateAssistantCard sessionReady={sessionReady} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Enrollment Funnel
            </h2>
            <p className="mt-1 text-ds-caption text-muted-foreground">
              Compact snapshot of your highest-signal pipeline stages.
            </p>
          </div>
          <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-ds-caption font-medium text-muted-foreground shadow-sm">
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
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card, index) => (
              <Card
                key={card.label}
                className={cn(
                  'relative overflow-hidden rounded-[1.35rem] border backdrop-blur-sm',
                  card.cardClass,
                  cards.length % 2 === 1 &&
                    index === cards.length - 1 &&
                    'col-span-2',
                )}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.08] to-transparent"
                  aria-hidden
                />
                <CardContent className="relative px-4 py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <card.Icon
                      className={`size-4 ${card.iconClass}`}
                      aria-hidden
                    />
                    <span className="text-ds-caption font-semibold text-muted-foreground">
                      {card.sub}
                    </span>
                  </div>
                  <p
                    className={`text-3xl font-semibold tabular-nums ${card.accent}`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-ds-caption font-medium text-muted-foreground">
                    {card.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-semibold text-foreground">Recent Leads</h2>
            <p className="mt-1 text-ds-caption text-muted-foreground">
              Fresh records from your latest workboard activity.
            </p>
          </div>
          <Link to="/dashboard/work/leads" className="text-ds-caption font-semibold text-primary">
            View all
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <Card className="border-border/70 bg-card/95">
            <CardContent className="px-4 py-5 text-sm text-muted-foreground">No leads yet</CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {recentLeads.slice(0, 5).map((lead) => (
              <Link
                key={lead.id}
                to={`/dashboard/work/leads/${lead.id}`}
                className="group block rounded-[1.35rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.55))] px-4 py-3.5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.35)] transition hover:border-primary/25 hover:shadow-[0_24px_48px_-34px_rgba(84,101,255,0.45)] dark:bg-[linear-gradient(180deg,rgba(10,15,26,0.95),rgba(7,10,18,0.98))]"
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
                  <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">
                    #{lead.id}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
                      {humanizeStatus(lead.status)}
                    </span>
                    {lead.phone ? (
                      <span className="truncate text-[0.72rem] text-muted-foreground">{lead.phone}</span>
                    ) : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.72rem] font-semibold text-primary">
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
