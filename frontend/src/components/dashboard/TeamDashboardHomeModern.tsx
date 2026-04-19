import { Link } from 'react-router-dom'
import { Briefcase, FileCheck, IndianRupee, Phone, Video } from 'lucide-react'

import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { HomeQuickAction } from '@/config/dashboard-home-actions'
import type { LeadPublic } from '@/hooks/use-leads-query'
import type { TeamPersonalFunnel } from '@/hooks/use-team-personal-funnel-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'

// ── Lead Journey ──────────────────────────────────────────────────────────────

const STATUS_IDX: Record<string, number> = {
  new_lead: 0, contacted: 1, invited: 2, video_sent: 3, video_watched: 4,
  paid: 5, day1: 6, day2: 7, interview: 8, track_selected: 9,
  seat_hold: 10, converted: 11, lost: 12, retarget: 13, inactive: 14,
}

type JourneyStep = {
  key: string
  label: string
  idx: number
  d1Batches?: readonly ['d1_morning', 'd1_afternoon', 'd1_evening']
  d2Batches?: readonly ['d2_morning', 'd2_afternoon', 'd2_evening']
}

const JOURNEY_STEPS: JourneyStep[] = [
  { key: 'contacted',    label: 'Called',  idx: 1 },
  { key: 'video_watched',label: 'Video',   idx: 4 },
  { key: 'paid',         label: '₹196',    idx: 5 },
  { key: 'day1',         label: 'Day 1',   idx: 6, d1Batches: ['d1_morning', 'd1_afternoon', 'd1_evening'] },
  { key: 'day2',         label: 'Day 2',   idx: 7, d2Batches: ['d2_morning', 'd2_afternoon', 'd2_evening'] },
  { key: 'converted',    label: 'Done ✓',  idx: 11 },
]

function StepDot({ state }: { state: 'done' | 'current' | 'future' }) {
  return (
    <div className={cn(
      'h-3 w-3 shrink-0 rounded-full border-2',
      state === 'done'    && 'border-emerald-400 bg-emerald-400',
      state === 'current' && 'border-primary bg-primary shadow-[0_0_6px_rgba(212,175,55,0.5)]',
      state === 'future'  && 'border-violet-400/30 bg-violet-400/10',
    )} />
  )
}

function BatchDots({ done }: { done: boolean[] }) {
  return (
    <div className="mt-1 flex justify-center gap-0.5">
      {done.map((d, i) => (
        <div key={i} className={cn(
          'h-1.5 w-1.5 rounded-full',
          d ? 'bg-emerald-400' : 'bg-violet-400/30',
        )} />
      ))}
    </div>
  )
}

function LeadJourneyStrip({ lead }: { lead: LeadPublic }) {
  const leadIdx = STATUS_IDX[lead.status] ?? 0
  const isLost = lead.status === 'lost' || lead.status === 'retarget' || lead.status === 'inactive'

  return (
    <Link
      to={`/dashboard/work/leads/${lead.id}`}
      className="block rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 transition hover:border-primary/30"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
        {isLost ? (
          <span className="shrink-0 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[0.6rem] font-semibold text-destructive">
            {lead.status.replaceAll('_', ' ')}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
            {lead.status.replaceAll('_', ' ')}
          </span>
        )}
      </div>

      {/* Journey strip */}
      <div className="flex items-start gap-0">
        {JOURNEY_STEPS.map((step, i) => {
          const state: 'done' | 'current' | 'future' =
            leadIdx > step.idx ? 'done' : leadIdx === step.idx ? 'current' : 'future'
          const showBatches = (step.d1Batches || step.d2Batches) && state !== 'future'
          const batchDone = step.d1Batches
            ? step.d1Batches.map((k) => Boolean((lead as unknown as Record<string, boolean>)[k]))
            : step.d2Batches
            ? step.d2Batches.map((k) => Boolean((lead as unknown as Record<string, boolean>)[k]))
            : []

          return (
            <div key={step.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {i > 0 && (
                  <div className={cn(
                    'h-px flex-1',
                    leadIdx >= step.idx ? 'bg-emerald-400/50' : 'bg-violet-400/15',
                  )} />
                )}
                <StepDot state={state} />
                {i < JOURNEY_STEPS.length - 1 && (
                  <div className={cn(
                    'h-px flex-1',
                    leadIdx > step.idx ? 'bg-emerald-400/50' : 'bg-violet-400/15',
                  )} />
                )}
              </div>
              <span className={cn(
                'mt-1 text-center text-[0.55rem] font-medium leading-tight',
                state === 'done'    && 'text-emerald-400/80',
                state === 'current' && 'text-primary',
                state === 'future'  && 'text-violet-400/30',
              )}>
                {step.label}
              </span>
              {showBatches && <BatchDots done={batchDone} />}
            </div>
          )
        })}
      </div>
    </Link>
  )
}

function LeadJourneySection({ leads }: { leads: LeadPublic[] }) {
  if (leads.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold text-foreground">My Leads</h2>
        <Link to="/dashboard/work/leads" className="text-ds-caption font-semibold text-primary">
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {leads.slice(0, 8).map((l) => (
          <LeadJourneyStrip key={l.id} lead={l} />
        ))}
      </div>
    </section>
  )
}

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
): { label: string; value: number; sub: string; Icon: typeof Briefcase; accent: string; cardClass: string; iconClass: string }[] {
  return [
    {
      label: 'Claimed',
      value: today?.claimed_today ?? 0,
      sub: 'Today',
      Icon: Briefcase,
      accent: 'text-blue-400',
      cardClass: 'min-w-[140px] border-blue-500/20 bg-gradient-to-br from-blue-500/[0.08] to-transparent shadow-sm transition hover:border-blue-500/35',
      iconClass: 'text-blue-400/70',
    },
    {
      label: 'Calls',
      value: today?.calls_today ?? 0,
      sub: 'Today',
      Icon: Phone,
      accent: 'text-amber-400',
      cardClass: 'min-w-[140px] border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-transparent shadow-sm transition hover:border-amber-500/35',
      iconClass: 'text-amber-400/70',
    },
    {
      label: 'Video Reached',
      value: funnel?.video_reached ?? 0,
      sub: 'From assigned',
      Icon: Video,
      accent: 'text-indigo-400',
      cardClass: 'min-w-[140px] border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-transparent shadow-sm transition hover:border-indigo-500/35',
      iconClass: 'text-indigo-400/70',
    },
    {
      label: 'Proof Pending',
      value: funnel?.proof_pending ?? 0,
      sub: 'Awaiting review',
      Icon: FileCheck,
      accent: 'text-violet-400',
      cardClass: 'min-w-[140px] border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent shadow-sm transition hover:border-violet-500/35',
      iconClass: 'text-violet-400/70',
    },
    {
      label: 'Paid 196',
      value: funnel?.paid_196 ?? 0,
      sub: 'Enrolled',
      Icon: IndianRupee,
      accent: 'text-emerald-400',
      cardClass: 'min-w-[140px] border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent shadow-sm transition hover:border-emerald-500/35',
      iconClass: 'text-emerald-400/70',
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
          <span className="rounded-md bg-muted px-2 py-0.5 text-ds-caption font-medium text-muted-foreground">
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
                className={c.cardClass}
              >
                <CardContent className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <c.Icon className={`size-4 ${c.iconClass}`} aria-hidden />
                    <span className="text-ds-caption font-semibold text-muted-foreground">{c.sub}</span>
                  </div>
                  <p className={`text-3xl font-semibold tabular-nums ${c.accent}`}>{c.value}</p>
                  <p className="text-ds-caption text-muted-foreground">{c.label}</p>
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
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-ds-caption font-semibold text-primary">
                  {a.badgeCount}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <LeadJourneySection leads={recentLeads} />
    </div>
  )
}
