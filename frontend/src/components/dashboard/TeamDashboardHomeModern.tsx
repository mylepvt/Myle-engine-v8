import { Link } from 'react-router-dom'
import { ArrowRight, Clock3 } from 'lucide-react'

import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { XpBadge } from '@/components/xp/XpBadge'
import { Card, CardContent } from '@/components/ui/card'
import type { HomeQuickAction } from '@/config/dashboard-home-actions'
import type { LeadPublic } from '@/hooks/use-leads-query'
import type { TeamPersonalFunnel } from '@/hooks/use-team-personal-funnel-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'
import { formatRelativeTimeShort } from '@/lib/utils'



type Props = {
  sessionReady: boolean
  firstName: string
  funnel: TeamPersonalFunnel | undefined
  today: TeamTodayStats | undefined
  recentLeads: LeadPublic[]
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
  funnel,
  today,
  recentLeads,
  quickActions,
}: Props) {
  const topActions = quickActions.slice(0, 4)
  const primaryAction = topActions[0]
  const secondaryActions = topActions.slice(1, 4)
  const greeting = greetingForCurrentTime()
  const enrolledPct =
    funnel?.claimed && funnel.claimed > 0
      ? Math.round((funnel.paid_flp / funnel.claimed) * 100)
      : 0

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 pb-2">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--palette-blue)_38%,transparent),transparent_42%),linear-gradient(180deg,color-mix(in_srgb,var(--palette-ink)_92%,var(--palette-blue)_8%)_0%,color-mix(in_srgb,var(--palette-ink)_89%,var(--palette-blue)_11%)_48%,color-mix(in_srgb,var(--palette-ink)_96%,var(--palette-blue)_4%)_100%)] text-white shadow-[0_32px_80px_-44px_rgba(27,48,120,0.9)]">
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
              <p className="text-ds-label font-semibold uppercase tracking-[0.18em] text-blue-100/68">
                Min. FLP Billed
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none text-white">
                {today?.flp_min_billing_today ?? 0}
              </p>
              <p className="mt-1 text-[0.72rem] text-blue-100/70">
                {enrolledPct}% from claimed
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.08] px-3 py-3 backdrop-blur-sm">
              <p className="text-ds-label font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                Today&apos;s leads
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-white">
                {today?.claimed_today ?? 0}
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.08] px-3 py-3 backdrop-blur-sm">
              <p className="text-ds-label font-semibold uppercase tracking-[0.18em] text-blue-100/64">
                Calls
              </p>
              <p className="mt-2 text-xl font-semibold leading-none text-white">
                {today?.calls_today ?? 0}
              </p>
            </div>
          </div>

          {primaryAction ? (
            <Link
              to={primaryAction.to}
              className="group flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.14] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:bg-white/[0.18]"
            >
              <div className="min-w-0">
                <p className="text-ds-label font-semibold uppercase tracking-[0.18em] text-blue-100/64">
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
            <CardContent className="text-sm text-muted-foreground">No leads yet</CardContent>
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
                  <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-ds-label font-semibold text-muted-foreground">
                    #{lead.id}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-ds-label font-semibold text-primary">
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
