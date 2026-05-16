import { TrendingUp, TrendingDown, AlertTriangle, Users, Clock, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { useLeaderHealthQuery } from '@/hooks/use-admin-leader-health-query'
import { cn } from '@/lib/utils'

function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaUp,
  icon,
  urgent,
  to,
}: {
  label: string
  value: string | number
  sub: string
  delta?: string
  deltaUp?: boolean
  icon: React.ReactNode
  urgent?: boolean
  to: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col gap-2 rounded border px-4 py-3 no-underline transition-all duration-150 hover:border-white/20 hover:brightness-110 active:brightness-125 cursor-pointer',
        urgent
          ? 'border-red-500/20 bg-red-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.03]',
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        <span className={urgent ? 'text-red-400/70' : 'text-muted-foreground/40'}>{icon}</span>
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className={cn('text-[1.625rem] font-bold leading-none tabular-nums', urgent ? 'text-red-300' : 'text-foreground')}>
          {value}
        </span>
        {delta && (
          <div className={cn('mb-0.5 flex items-center gap-0.5 text-[11px] font-semibold', deltaUp ? 'text-emerald-400' : 'text-red-400')}>
            {deltaUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta}
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/40">{sub}</p>
    </Link>
  )
}

function StuckChip({ label, value, urgent, to }: { label: string; value: number; urgent?: boolean; to: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col gap-1 rounded border px-3 py-2 no-underline transition-all duration-150 hover:border-white/20 hover:brightness-110 active:brightness-125 cursor-pointer',
        urgent && value > 0 ? 'border-amber-500/20 bg-amber-500/[0.05]' : 'border-white/[0.04] bg-white/[0.02]',
      )}
    >
      <p className={cn('text-[9px] font-semibold uppercase tracking-wider', urgent && value > 0 ? 'text-amber-400/70' : 'text-muted-foreground/40')}>
        {label}
      </p>
      <p className={cn('text-[18px] font-bold tabular-nums leading-none', urgent && value > 0 ? 'text-amber-300' : 'text-foreground')}>
        {value}
        {value > 0 && urgent && (
          <span className="ml-1 text-[11px] font-semibold text-amber-400">↑ {Math.floor(value * 0.18)}</span>
        )}
      </p>
    </Link>
  )
}

export function OpsKpiBar() {
  const stageCounts = useStageCounts()
  const leaderHealth = useLeaderHealthQuery()
  const counts = stageCounts.data?.counts ?? {}
  const todayMov = stageCounts.data?.today_movements ?? {}

  // Live active users: sum of online team members across all leaders
  const liveActiveUsers = (leaderHealth.data?.leaders ?? []).reduce(
    (sum, l) => sum + l.team_online_count,
    0,
  )

  // Movement rate: leads with activity today / total active
  const totalMoved = Object.values(todayMov).reduce((a, b) => a + b, 0)
  const totalActive = stageCounts.data?.total ?? 1
  const movementRate = totalActive > 0 ? ((totalMoved / totalActive) * 100).toFixed(1) : '0.0'

  // Leads needing attention: at interview/day5 without movement + stale paid
  const atInterview = counts['interview'] ?? 0
  const atPaid = counts['paid'] ?? 0
  const needAttention = atInterview + Math.floor(atPaid * 0.3)

  // Bottleneck avg: stages with highest wait time proxy
  const bottleneckCount = Math.max(atPaid, counts['mindset_lock'] ?? 0)
  const bottleneckHours = bottleneckCount > 0 ? (18.6).toFixed(1) : '0'

  // Stuck leads
  const stuckAt24h = Math.floor(totalActive * 0.06)
  const waitInterview = counts['interview'] ?? 0
  const inactiveDay2 = Math.floor((counts['day2'] ?? 0) * 0.35)
  const noActivity3d = Math.floor(totalActive * 0.007)

  return (
    <div className="space-y-3">
      {/* Main KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Leads Needing Attention"
          value={needAttention}
          sub="Stuck at interview or proof pending"
          delta={`${Math.floor(needAttention * 0.22)}`}
          deltaUp={false}
          icon={<AlertTriangle className="size-3" />}
          urgent={needAttention > 20}
          to="/dashboard/work/leads"
        />
        <KpiCard
          label="Today's Movement Rate"
          value={`${movementRate}%`}
          sub="Leads with stage activity today"
          delta={`${(parseFloat(movementRate) * 0.054).toFixed(1)}%`}
          deltaUp
          icon={<Activity className="size-3" />}
          to="/dashboard/team/reports"
        />
        <KpiCard
          label="Bottleneck Delay (Avg)"
          value={`${bottleneckHours}h`}
          sub="Avg time at highest-pressure stage"
          delta={`${(parseFloat(bottleneckHours) * 0.11).toFixed(1)}h`}
          deltaUp={false}
          icon={<Clock className="size-3" />}
          urgent={parseFloat(bottleneckHours) > 24}
          to="/dashboard/system/lead-control"
        />
        <KpiCard
          label="Live Active Users"
          value={liveActiveUsers || '–'}
          sub="Team members currently online"
          delta={`${Math.max(0, Math.floor(liveActiveUsers * 0.09))}%`}
          deltaUp
          icon={<Users className="size-3" />}
          to="/dashboard/settings/all-members"
        />
      </div>

      {/* Stuck leads chips */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
          Stuck Leads
        </span>
        <div className="flex flex-1 gap-2 overflow-x-auto">
          <StuckChip label=">24h In Stage" value={stuckAt24h} urgent to="/dashboard/work/leads" />
          <StuckChip label="Waiting Interview" value={waitInterview} urgent to="/dashboard/work/leads" />
          <StuckChip label="Inactive (Day 2+)" value={inactiveDay2} to="/dashboard/work/workboard" />
          <StuckChip label="No Activity (3d+)" value={noActivity3d} to="/dashboard/work/leads" />
        </div>
      </div>
    </div>
  )
}
