import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Phone,
  Plus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { useOnlineNowQuery, type OnlineUserItem } from '@/hooks/use-online-now-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { useSalesDashboardQuery } from '@/hooks/use-sales-query'
import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'
import { CaseCreditCheque, TopEarners } from '@/components/dashboard/overview/FinanceEarners'

type Props = {
  firstName: string
  onCreateTask: () => void
}

function statusLabel(status: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

/** IST-aware greeting by current hour. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/* Online-users popover list (working / idle split). */
function OnlinePanel({ users }: { users: OnlineUserItem[] }) {
  const working = users.filter((u) => u.is_working)
  const idle = users.filter((u) => !u.is_working)
  const Row = ({ u }: { u: OnlineUserItem }) => (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className={cn('size-1.5 shrink-0 rounded-full', u.presence_status === 'online' ? 'bg-success' : 'bg-warning')}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{u.name}</span>
      <span className="shrink-0 text-[10px] capitalize text-muted-foreground/60">{u.role}</span>
      {u.is_working ? (
        <span className="shrink-0 text-[10px] text-success">
          {u.calls_today > 0 ? `${u.calls_today}c` : ''}{u.leads_today > 0 ? ` ${u.leads_today}l` : ''}
        </span>
      ) : (
        <span className="shrink-0 text-[10px] text-muted-foreground/40">idle</span>
      )}
    </div>
  )
  return (
    <div className="max-h-72 divide-y divide-border/40 overflow-y-auto">
      {working.length > 0 && (
        <div className="pb-1">
          <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-success">
            Working ({working.length})
          </p>
          <div className="px-3">{working.map((u) => <Row key={u.user_id} u={u} />)}</div>
        </div>
      )}
      {idle.length > 0 && (
        <div className="pb-1">
          <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            Not working ({idle.length})
          </p>
          <div className="px-3">{idle.map((u) => <Row key={u.user_id} u={u} />)}</div>
        </div>
      )}
      {users.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">No one online</p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hero band — greeting + live online (clickable) + primary Create Task action
 * ────────────────────────────────────────────────────────────────────────── */
function HeroBand({
  firstName,
  onlineCount,
  workingCount,
  users,
  onCreateTask,
}: {
  firstName: string
  onlineCount: number
  workingCount: number
  users: OnlineUserItem[]
  onCreateTask: () => void
}) {
  const [onlineOpen, setOnlineOpen] = useState(false)
  const onlineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!onlineOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (onlineRef.current && !onlineRef.current.contains(e.target as Node)) setOnlineOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOnlineOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onlineOpen])

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return (
    <div className="relative rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      {/* Decorative blob — clipped in its own layer so it can't bleed past the
          rounded corners, while leaving the card free to show the online popover. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
              {today}
            </p>
          </div>
          <h1 className="mt-1 truncate font-heading text-ds-h2 font-bold capitalize tracking-tight text-foreground">
            {greeting()}, {firstName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div ref={onlineRef} className="relative">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={onlineOpen}
                onClick={() => setOnlineOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/[0.08] px-2.5 py-0.5 text-ds-caption font-semibold text-success transition hover:bg-success/[0.14] focus:outline-none focus:ring-2 focus:ring-success/30"
              >
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                {onlineCount} online
              </button>
              {onlineOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
                  <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
                    <span className="text-[11px] font-semibold text-foreground">Online now</span>
                    <span className="text-[10px] text-muted-foreground/60">{workingCount} working</span>
                  </div>
                  <OnlinePanel users={users} />
                </div>
              )}
            </div>
            <span className="text-ds-caption text-muted-foreground">{workingCount} working now</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCreateTask}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Plus className="size-4" aria-hidden />
            Create Task
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * KPI strip — today's operational pulse
 * ────────────────────────────────────────────────────────────────────────── */
type Kpi = {
  label: string
  value: number
  icon: typeof Phone
  accent: string
  to: string
  hint: string
}

function KpiCard({ kpi, loading }: { kpi: Kpi; loading: boolean }) {
  const Icon = kpi.icon
  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-7 w-12" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Link
      to={kpi.to}
      className="block rounded-xl no-underline outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Card className="h-full border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <span className={cn('flex size-7 items-center justify-center rounded-lg', kpi.accent)}>
              <Icon className="size-4" aria-hidden />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-foreground">
            {kpi.value}
          </p>
          <p className="mt-1.5 text-ds-caption text-subtle">{kpi.hint}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

function KpiStrip({
  loading,
  claimedToday,
  callsToday,
  day1Today,
  convertedToday,
}: {
  loading: boolean
  claimedToday: number
  callsToday: number
  day1Today: number
  convertedToday: number
}) {
  const kpis: Kpi[] = [
    {
      label: 'Claimed today',
      value: claimedToday,
      icon: UserPlus,
      accent: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
      to: '/dashboard/team/reports',
      hint: 'Pool / ledger claims (IST)',
    },
    {
      label: 'Calls today',
      value: callsToday,
      icon: Phone,
      accent: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
      to: '/dashboard/work/follow-ups',
      hint: 'Logged calls (IST)',
    },
    {
      label: 'Day 1 active',
      value: day1Today,
      icon: Users,
      accent: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
      to: '/dashboard/work/workboard',
      hint: 'In Day 1 pipeline',
    },
    {
      label: 'Converted',
      value: convertedToday,
      icon: CheckCircle2,
      accent: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      to: '/dashboard/work/leads',
      hint: 'Paid / converted',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard key={k.label} kpi={k} loading={loading} />
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Live Pipeline — funnel of lead stages
 * ────────────────────────────────────────────────────────────────────────── */
const STAGE_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-amber-500',
  'bg-emerald-500',
]

function LivePipeline({
  loading,
  stages,
}: {
  loading: boolean
  stages: { status: string; total: number; label: string }[]
}) {
  const max = Math.max(...stages.map((s) => s.total), 1)
  const grandTotal = stages.reduce((a, s) => a + s.total, 0)

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Live Pipeline</h2>
          </div>
          <Link
            to="/dashboard/work/workboard"
            className="inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
          >
            Open board <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : stages.length === 0 ? (
          <p className="py-6 text-center text-ds-body text-muted-foreground">
            No active leads in the pipeline yet.
          </p>
        ) : (
          <div className="space-y-2">
            {stages.map((s, i) => {
              const pct = Math.round((s.total / max) * 100)
              const sharePct = grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0
              return (
                <div key={s.status} className="group flex items-center gap-2 sm:gap-3">
                  <span className="w-20 shrink-0 truncate text-right text-ds-caption font-medium text-muted-foreground sm:w-28">
                    {s.label}
                  </span>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-muted/50 sm:h-8">
                    <div
                      className={cn(
                        'flex h-full items-center justify-end rounded-lg px-1.5 transition-all duration-500 sm:px-2',
                        STAGE_COLORS[i % STAGE_COLORS.length],
                      )}
                      style={{ width: `${Math.max(pct, 6)}%` }}
                    >
                      <span className="text-[11px] font-bold tabular-nums text-white drop-shadow sm:text-xs">
                        {s.total}
                      </span>
                    </div>
                  </div>
                  <span className="w-8 shrink-0 text-right text-ds-caption tabular-nums text-subtle sm:w-10">
                    {sharePct}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * OverviewTab — orchestrator (Phase 1: hero + KPIs + pipeline)
 * ────────────────────────────────────────────────────────────────────────── */
export function OverviewTab({ firstName, onCreateTask }: Props) {
  const reports = useTeamReportsQuery('', true)
  const online = useOnlineNowQuery()
  const wb = useWorkboardQuery(true)
  const sales = useSalesDashboardQuery(true)

  const ls = reports.data?.live_summary

  const stages = useMemo(() => {
    const cols = wb.data?.columns ?? []
    return cols
      .filter((c) => c.status !== 'lost')
      .map((c) => ({
        status: c.status,
        total: typeof c.total === 'number' ? c.total : 0,
        label: statusLabel(c.status),
      }))
      .filter((s) => s.total > 0)
  }, [wb.data?.columns])

  return (
    <div className="space-y-5">
      <HeroBand
        firstName={firstName}
        onlineCount={online.data?.online_count ?? 0}
        workingCount={online.data?.working_count ?? 0}
        users={online.data?.users ?? []}
        onCreateTask={onCreateTask}
      />

      <KpiStrip
        loading={reports.isPending}
        claimedToday={ls?.leads_claimed_today ?? 0}
        callsToday={ls?.calls_made_today ?? 0}
        day1Today={ls?.day1_total ?? 0}
        convertedToday={ls?.converted_total ?? 0}
      />

      <LivePipeline loading={wb.isPending} stages={stages} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <CaseCreditCheque data={sales.data} loading={sales.isPending} />
        <TopEarners data={sales.data} loading={sales.isPending} />
      </div>
    </div>
  )
}
