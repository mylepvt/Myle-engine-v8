import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  UserPlus,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Wallet,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Calendar,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useTeamTrackingDetailQuery,
  type TeamTrackingDetailResponse,
  type TeamTrackingMemberSummary,
  type TeamTrackingTrendPoint,
  type TeamTrackingActivityItem,
} from '@/hooks/use-team-tracking-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

// ── Date utils ─────────────────────────────────────────────────────────────

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function weekdayShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)
}

// ── Avatar helpers (consistent with PeopleOpsPanel) ───────────────────────

function avatarColor(name: string): string {
  const COLORS = ['#5865f2', '#eb459e', '#3ba55c', '#f0b232', '#9b59b6', '#1abc9c', '#e67e22']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string): string {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ── Badge variant helpers ──────────────────────────────────────────────────

function scoreVariant(band: 'low' | 'medium' | 'high') {
  if (band === 'high') return 'success' as const
  if (band === 'medium') return 'warning' as const
  return 'danger' as const
}

function presenceVariant(status: 'online' | 'idle' | 'offline') {
  if (status === 'online') return 'success' as const
  if (status === 'idle') return 'warning' as const
  return 'outline' as const
}

function complianceVariant(level: string | null) {
  if (level === 'removed') return 'danger' as const
  if (level === 'final_warning' || level === 'strong_warning') return 'warning' as const
  if (level === 'warning') return 'primary' as const
  if (level === 'grace' || level === 'grace_ending') return 'outline' as const
  if (level === 'clear') return 'success' as const
  return 'secondary' as const
}

// ── Activity label mapping ────────────────────────────────────────────────

type ActionMeta = { label: string; icon: typeof Phone; color: string }

const ACTION_MAP: Record<string, ActionMeta> = {
  'lead:created':          { label: 'New lead added',          icon: UserPlus,       color: 'text-primary' },
  'lead:claimed':          { label: 'Lead claimed',            icon: CheckCircle2,   color: 'text-emerald-600 dark:text-emerald-400' },
  'lead:batch_claimed':    { label: 'Batch leads claimed',     icon: CheckCircle2,   color: 'text-emerald-600 dark:text-emerald-400' },
  'lead:transitioned':     { label: 'Lead stage moved',        icon: ArrowRightLeft, color: 'text-blue-600 dark:text-blue-400' },
  lead_state:              { label: 'Lead stage updated',      icon: ArrowRightLeft, color: 'text-blue-600 dark:text-blue-400' },
  'lead:closed':           { label: 'Lead closed',             icon: Target,         color: 'text-violet-600 dark:text-violet-400' },
  'lead:assigned':         { label: 'Lead reassigned',         icon: ArrowRightLeft, color: 'text-slate-400' },
  'lead:auto_reassigned':  { label: 'Lead auto-reassigned',    icon: ArrowRightLeft, color: 'text-slate-400' },
  'auto_handoff.call_logged': { label: 'Outbound call logged', icon: Phone,          color: 'text-emerald-600 dark:text-emerald-400' },
  'wallet:credited':       { label: 'Wallet credited',         icon: Wallet,         color: 'text-amber-600 dark:text-amber-400' },
  'wallet:credited_worker':{ label: 'Wallet credited',         icon: Wallet,         color: 'text-amber-600 dark:text-amber-400' },
  'fsm:validation_failed': { label: 'Stage change blocked',    icon: XCircle,        color: 'text-destructive' },
}

function resolveAction(action: string): ActionMeta {
  if (ACTION_MAP[action]) return ACTION_MAP[action]
  const prefixKey = Object.keys(ACTION_MAP).find((k) => action.startsWith(k))
  if (prefixKey) return ACTION_MAP[prefixKey]
  return {
    label: action.replace(/[.:_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: Activity,
    color: 'text-muted-foreground',
  }
}

// ── Computed operational insights ─────────────────────────────────────────

function computeInsights(data: TeamTrackingDetailResponse): string[] {
  const { member, trend } = data
  const out: string[] = []
  if (!trend.length) return out

  const last = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  if (last && prev) {
    const delta = last.consistency_score - prev.consistency_score
    if (delta >= 6)  out.push(`Score improved ${delta} pts from previous day`)
    if (delta <= -6) out.push(`Score dropped ${Math.abs(delta)} pts from previous day`)
  }

  if (member.calls_short_streak > 1)
    out.push(`Low call activity for ${member.calls_short_streak} consecutive days`)
  if (member.missing_report_streak > 1)
    out.push(`No activity report for ${member.missing_report_streak} consecutive days`)

  const avgCalls = trend.reduce((s, p) => s + p.calls_count, 0) / trend.length
  if (avgCalls > 0) {
    if (member.calls_count > avgCalls * 1.35)
      out.push(`Calls today ${Math.round(((member.calls_count - avgCalls) / avgCalls) * 100)}% above 7-day average`)
    else if (member.calls_count < avgCalls * 0.45)
      out.push('Call volume today below typical daily pace')
  }

  if (member.calls_count > 0 && member.followups_done_count === 0)
    out.push('No follow-ups logged despite calls made today')
  if (member.calls_count > 0 && member.followups_done_count > 0) {
    const ratio = member.followups_done_count / member.calls_count
    if (ratio >= 0.7)
      out.push(`Strong follow-up discipline — ${Math.round(ratio * 100)}% follow-up rate`)
  }

  const highDays = trend.filter((p) => p.consistency_band === 'high').length
  if (highDays >= 5) out.push(`${highDays}/7 days at high performance — strong consistency`)

  const best = [...trend].sort((a, b) => b.calls_count - a.calls_count)[0]
  if (best && best.calls_count > 0 && best.date !== data.date)
    out.push(`Best day this week: ${formatShortDate(best.date)} with ${best.calls_count} calls`)

  return out
}

// ── SVG Score Ring ────────────────────────────────────────────────────────

function ScoreRing({ score, band }: { score: number; band: 'low' | 'medium' | 'high' }) {
  const R = 36
  const SW = 7
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.max(0, Math.min(100, score)) / 100)

  const ringColor =
    band === 'high' ? '#22c55e' :
    band === 'medium' ? '#f59e0b' :
    '#ef4444'

  return (
    <div className="relative flex items-center justify-center">
      <svg width="84" height="84" viewBox="0 0 84 84">
        {/* Track */}
        <circle cx="42" cy="42" r={R} fill="none" strokeWidth={SW} stroke="currentColor" className="text-border/50" />
        {/* Progress arc */}
        <circle
          cx="42" cy="42" r={R}
          fill="none"
          strokeWidth={SW}
          strokeLinecap="round"
          stroke={ringColor}
          style={{
            strokeDasharray: `${C}`,
            strokeDashoffset: `${offset}`,
            transform: 'rotate(-90deg)',
            transformOrigin: '42px 42px',
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold tabular-nums leading-none text-foreground">{score}</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">score</span>
      </div>
    </div>
  )
}

// ── 7-Day Trend Bars (pure CSS) ───────────────────────────────────────────

function TrendBars({ trend }: { trend: TeamTrackingTrendPoint[] }) {
  const maxVal = Math.max(...trend.flatMap((p) => [p.calls_count, p.leads_added_count, p.followups_done_count]), 1)

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-emerald-400" />Calls
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-violet-400" />Leads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-amber-400" />Follow-ups
        </span>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1" style={{ height: '88px' }}>
        {trend.map((point) => {
          const cH = Math.max((point.calls_count / maxVal) * 100, point.calls_count > 0 ? 3 : 0)
          const lH = Math.max((point.leads_added_count / maxVal) * 100, point.leads_added_count > 0 ? 3 : 0)
          const fH = Math.max((point.followups_done_count / maxVal) * 100, point.followups_done_count > 0 ? 3 : 0)

          return (
            <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end gap-px" style={{ height: '72px' }}>
                <div className="flex-1 rounded-sm bg-emerald-400/80 transition-all duration-500" style={{ height: `${cH}%` }} />
                <div className="flex-1 rounded-sm bg-violet-400/80 transition-all duration-500" style={{ height: `${lH}%` }} />
                <div className="flex-1 rounded-sm bg-amber-400/80 transition-all duration-500" style={{ height: `${fH}%` }} />
              </div>
              {/* Score dot */}
              <div
                className={cn('size-1.5 rounded-full flex-shrink-0',
                  point.consistency_band === 'high' ? 'bg-emerald-500 dark:bg-emerald-400' :
                  point.consistency_band === 'medium' ? 'bg-amber-500 dark:bg-amber-400' : 'bg-rose-500 dark:bg-rose-400'
                )}
              />
              <span className="text-[9px] leading-none text-muted-foreground/50">{weekdayShort(point.date)}</span>
            </div>
          )
        })}
      </div>

      {/* Score numbers row */}
      <div className="flex items-center gap-1 border-t border-border/40 pt-2">
        {trend.map((point) => (
          <div key={point.date} className="flex flex-1 justify-center">
            <span className={cn(
              'text-[10px] font-bold tabular-nums',
                point.consistency_band === 'high' ? 'text-emerald-600 dark:text-emerald-400' :
                  point.consistency_band === 'medium' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
            )}>
              {point.consistency_score}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Funnel ───────────────────────────────────────────────────────

function ActivityFunnel({ member }: { member: TeamTrackingMemberSummary }) {
  const base = Math.max(member.calls_count, member.leads_added_count, member.followups_done_count, 1)
  const steps = [
    {
      label: 'Calls Made',
      value: member.calls_count,
      pct: Math.round((member.calls_count / base) * 100),
      barClass: 'bg-emerald-400/30 border-emerald-400/40',
      textClass: 'text-emerald-400',
    },
    {
      label: 'Follow-ups Done',
      value: member.followups_done_count,
      pct: Math.round((member.followups_done_count / base) * 100),
      barClass: 'bg-violet-400/30 border-violet-400/40',
      textClass: 'text-violet-400',
    },
    {
      label: 'Leads Added',
      value: member.leads_added_count,
      pct: Math.round((member.leads_added_count / base) * 100),
      barClass: 'bg-amber-400/30 border-amber-400/40',
      textClass: 'text-amber-400',
    },
  ]

  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.label}>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{step.label}</span>
            <span className={cn('font-bold tabular-nums', step.textClass)}>{step.value}</span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-muted/20">
            <div
              className={cn('h-full rounded-full border transition-all duration-700', step.barClass)}
              style={{ width: step.value > 0 ? `${Math.max(step.pct, 4)}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Weekly Heatmap ────────────────────────────────────────────────────────

function WeeklyHeatmap({ trend }: { trend: TeamTrackingTrendPoint[] }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {trend.map((point) => (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                'aspect-square w-full max-w-[38px] rounded border',
                point.consistency_band === 'high' ? 'bg-emerald-400/50 border-emerald-400/40' :
                point.consistency_band === 'medium' ? 'bg-amber-400/45 border-amber-400/35' :
                'bg-rose-500/40 border-rose-500/30'
              )}
              title={`${formatShortDate(point.date)}: Score ${point.consistency_score}`}
            />
            <span className="text-[9px] text-muted-foreground/50">{weekdayShort(point.date)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-emerald-400/50 border border-emerald-400/40" />High
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-amber-400/45 border border-amber-400/35" />Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-rose-500/40 border border-rose-500/30" />Low
        </span>
      </div>
    </div>
  )
}

// ── Smart Activity Timeline ───────────────────────────────────────────────

function ActivityTimeline({ items }: { items: TeamTrackingActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Activity className="size-6 text-muted-foreground/25" />
        <p className="text-[12px] text-muted-foreground/50">No activity recorded for this date</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute bottom-0 left-[10px] top-1 w-px bg-border/50" />

      <div className="space-y-0">
        {items.map((item, idx) => {
          const { label, icon: Icon, color } = resolveAction(item.action)
          const isLast = idx === items.length - 1

          return (
            <div key={`${item.action}-${item.occurred_at}-${idx}`} className={cn('flex items-start gap-3 pl-0.5', !isLast && 'pb-3')}>
              {/* Icon node */}
              <div className={cn(
                'relative z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded border bg-card',
                color
              )}>
                <Icon className="size-3" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-medium leading-snug text-foreground">{label}</p>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                    {formatRelativeTimeShort(item.occurred_at)}
                  </span>
                </div>
                {(item.entity_type || item.entity_id) ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                    {item.entity_type && <span className="capitalize">{item.entity_type}</span>}
                    {item.entity_id ? ` #${item.entity_id}` : ''}
                    {' · '}
                    {formatTime(item.occurred_at)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/40">{formatTime(item.occurred_at)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

type Props = {
  title: string
  userId: number
}

export function TeamTrackingDetailPage({ title, userId }: Props) {
  const [params, setParams] = useSearchParams()
  const dateIso = params.get('date') || todayIsoLocal()

  const { data, isPending, isError, error, refetch } = useTeamTrackingDetailQuery(userId, dateIso)

  const avgScore = useMemo(() => {
    if (!data?.trend.length) return 0
    return Math.round(data.trend.reduce((s, p) => s + p.consistency_score, 0) / data.trend.length)
  }, [data])

  const todayVsAvg = data ? data.member.consistency_score - avgScore : 0

  const computedInsights = useMemo(() => (data ? computeInsights(data) : []), [data])

  return (
    <div className="max-w-3xl space-y-4 pb-8">

      {/* ── Breadcrumb + Date ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            to={`/dashboard/team/tracking?date=${encodeURIComponent(dateIso)}`}
            className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Team
          </Link>
          <span className="text-muted-foreground/30">/</span>
          <span className="truncate font-medium text-foreground">{title}</span>
        </div>

        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Calendar className="size-3.5" />
          <input
            type="date"
            value={dateIso}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              next.set('date', e.target.value)
              setParams(next)
            }}
            className="rounded border border-border/60 bg-muted/30 px-2.5 py-1.5 text-foreground focus:border-primary/60 focus:outline-none"
          />
        </label>
      </div>

      {/* ── Skeleton ─────────────────────────────────────────── */}
      {isPending && (
        <div className="space-y-3 animate-fade-in">
          <Skeleton className="h-52 rounded" />
          <Skeleton className="h-40 rounded" />
          <Skeleton className="h-56 rounded" />
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {isError && (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}

      {data && (
        <div className="space-y-4 animate-fade-in">

          {/* ══ SECTION 1 — HERO CARD ════════════════════════════ */}
          <Card className="surface-elevated overflow-hidden">
            <CardContent className="p-0">

              {/* Identity + Score Ring */}
              <div className="flex items-start gap-4 p-4 pb-3">

                {/* Avatar with presence dot */}
                <div className="relative shrink-0">
                  <div
                    className="flex size-[52px] items-center justify-center rounded-full text-[17px] font-bold text-white"
                    style={{ backgroundColor: avatarColor(data.member.member_name) }}
                  >
                    {initials(data.member.member_name)}
                  </div>
                  <span className={cn(
                    'absolute -bottom-0.5 -right-0.5 block size-3.5 rounded-full border-2 border-card',
                    data.member.presence_status === 'online' ? 'bg-emerald-400' :
                    data.member.presence_status === 'idle' ? 'bg-amber-400' : 'bg-slate-500'
                  )} />
                  {data.member.presence_status === 'online' && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-3.5 animate-ping rounded-full bg-emerald-400/40" />
                  )}
                </div>

                {/* Name + meta + badges */}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-bold leading-tight text-foreground">
                    {data.member.member_name}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {data.member.member_fbo_id}
                    {data.member.leader_name && (
                      <> · <span className="text-foreground/60">{data.member.leader_name}</span></>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={presenceVariant(data.member.presence_status)} className="text-[10px]">
                      {data.member.presence_status === 'online' ? '● Online' :
                       data.member.presence_status === 'idle' ? '◌ Idle' : '○ Offline'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {data.member.member_role}
                    </Badge>
                    {data.member.compliance_title && (
                      <Badge variant={complianceVariant(data.member.compliance_level)} className="text-[10px]">
                        {data.member.compliance_title}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Score Ring + delta */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <ScoreRing score={data.member.consistency_score} band={data.member.consistency_band} />
                  {todayVsAvg !== 0 && (
                    <div className={cn(
                      'flex items-center gap-0.5 text-[10px] font-medium',
                      todayVsAvg > 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {todayVsAvg > 0
                        ? <TrendingUp className="size-3" />
                        : <TrendingDown className="size-3" />}
                      {todayVsAvg > 0 ? '+' : ''}{todayVsAvg} vs avg
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 h-px bg-border/50" />

              {/* Metrics row: 4 columns */}
              <div className="grid grid-cols-4 divide-x divide-border/50">
                {[
                  { label: 'Calls',      value: data.member.calls_count,         color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Leads',      value: data.member.leads_added_count,    color: 'text-primary' },
                  { label: 'Follow-ups', value: data.member.followups_done_count, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Logins',     value: data.member.login_count,          color: 'text-muted-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5 py-3">
                    <span className={cn('text-[20px] font-bold tabular-nums leading-none', color)}>{value}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/55">{label}</span>
                  </div>
                ))}
              </div>

              {/* Last active + streak footer */}
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                <span className="text-[10px] text-muted-foreground/55">
                  {data.member.last_activity_at
                    ? <>Active {formatRelativeTimeShort(data.member.last_activity_at)}</>
                    : 'No recent activity'}
                </span>
                {(data.member.calls_short_streak > 0 || data.member.missing_report_streak > 0) && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
                    <Clock className="size-3" />
                    {data.member.calls_short_streak > 0
                      ? `${data.member.calls_short_streak}d low calls`
                      : `${data.member.missing_report_streak}d no report`}
                  </span>
                )}
              </div>

            </CardContent>
          </Card>

          {/* ══ SECTION 2 — 7-DAY TREND ════════════════════════ */}
          {data.trend.length > 0 && (
            <Card className="surface-elevated">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">7-Day Activity Trend</CardTitle>
                  <Badge
                    variant={scoreVariant(avgScore >= 70 ? 'high' : avgScore >= 40 ? 'medium' : 'low')}
                    className="text-[10px]"
                  >
                    Avg {avgScore}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <TrendBars trend={data.trend} />
              </CardContent>
            </Card>
          )}

          {/* ══ SECTION 3 — FUNNEL + HEATMAP ══════════════════ */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="surface-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Activity Conversion</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFunnel member={data.member} />
              </CardContent>
            </Card>

            <Card className="surface-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weekly Consistency</CardTitle>
              </CardHeader>
              <CardContent>
                {data.trend.length > 0
                  ? <WeeklyHeatmap trend={data.trend} />
                  : <p className="text-[12px] text-muted-foreground">No trend data available.</p>}
              </CardContent>
            </Card>
          </div>

          {/* ══ SECTION 4 — OPERATIONAL INTELLIGENCE ══════════ */}
          {(data.member.insights.length > 0 || computedInsights.length > 0) && (
            <Card className="surface-elevated">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Zap className="size-3.5 text-amber-400" />
                  <CardTitle className="text-sm">Operational Intelligence</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.member.insights.map((insight) => (
                  <div key={insight} className="flex items-start gap-2.5 rounded border border-amber-600/15 bg-amber-600/[0.05] px-3 py-2.5 dark:border-amber-400/15 dark:bg-amber-400/[0.05]">
                    <span className="mt-px shrink-0 text-xs text-amber-600 dark:text-amber-400">!</span>
                    <p className="text-[12.5px] text-foreground">{insight}</p>
                  </div>
                ))}
                {computedInsights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded border border-border/40 bg-muted/20 px-3 py-2.5">
                    <span className="mt-px shrink-0 text-[10px] text-primary">→</span>
                    <p className="text-[12.5px] text-muted-foreground">{insight}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ══ SECTION 5 — SMART ACTIVITY TIMELINE ═══════════ */}
          <Card className="surface-elevated">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Activity Feed</CardTitle>
                <span className="text-[10px] text-muted-foreground/50">{data.recent_activity.length} events</span>
              </div>
            </CardHeader>
            <CardContent>
              <ActivityTimeline items={data.recent_activity} />
            </CardContent>
          </Card>

          {/* ══ MEMBER DETAILS ══════════════════════════════════ */}
          <Card className="surface-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Member Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
                {([
                  ['Email',     data.member.member_email],
                  ['Phone',     data.member.member_phone || '—'],
                  ['FBO ID',    data.member.member_fbo_id],
                  ['Role',      data.member.member_role],
                  ['Leader',    data.member.leader_name || '—'],
                  ['Last seen', data.member.last_seen_at ? formatRelativeTimeShort(data.member.last_seen_at) : '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground/60">{label}:</span>
                    <span className="truncate text-foreground">{value}</span>
                  </div>
                ))}
                {data.member.compliance_summary && (
                  <div className="col-span-full flex gap-2">
                    <span className="shrink-0 text-muted-foreground/60">Compliance:</span>
                    <span className="text-foreground">{data.member.compliance_summary}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
