import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLeaderHealthQuery, type LeaderHealthItem } from '@/hooks/use-admin-leader-health-query'
import { useAdminFeedStore } from '@/stores/admin-feed-store'
import { cn } from '@/lib/utils'

// ── Rank badge colors ──────────────────────────────────────────────────────
const RANK_COLORS = ['#f59e0b', '#9ca3af', '#cd7c2f', '#5865f2', '#6b7280']

function rankBg(rank: number): string {
  return RANK_COLORS[rank - 1] ?? '#6b7280'
}

// Generate consistent avatar color from name
function avatarColor(name: string): string {
  const COLORS = ['#5865f2', '#eb459e', '#3ba55c', '#f0b232', '#9b59b6', '#1abc9c', '#e67e22']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ── Leader card (Top Leaders section) ─────────────────────────────────────
function LeaderCard({ leader, rank }: { leader: LeaderHealthItem; rank: number }) {
  const color = avatarColor(leader.leader_name)
  const isOnline = leader.presence_status === 'online'
  return (
    <Link to="/dashboard/settings/all-members" className="flex min-w-[100px] flex-1 flex-col items-center gap-2 rounded border border-white/[0.06] bg-white/[0.03] p-3 text-center no-underline transition-all duration-150 hover:border-white/20 hover:bg-white/[0.07] active:bg-white/[0.1] cursor-pointer">
      {/* Rank badge */}
      <div
        className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow"
        style={{ backgroundColor: rankBg(rank) }}
      >
        {rank}
      </div>
      {/* Avatar */}
      <div className="relative">
        <div
          className="flex size-12 items-center justify-center rounded-full text-[15px] font-bold text-white shadow-lg"
          style={{ backgroundColor: color }}
        >
          {initials(leader.leader_name)}
        </div>
        {/* Online indicator */}
        <span
          className={cn(
            'absolute bottom-0 right-0 block size-3 rounded-full border-2 border-[#111214]',
            isOnline ? 'bg-emerald-400' : 'bg-gray-600',
          )}
        />
      </div>
      {/* Name */}
      <div>
        <p className="text-[11px] font-semibold leading-tight text-foreground">{leader.leader_name}</p>
        <p className="text-[10px] text-muted-foreground/60">
          {leader.team_size} member team
        </p>
      </div>
      {/* Stats row */}
      <div className="flex w-full items-center justify-around gap-1 border-t border-white/[0.06] pt-2">
        <div className="text-center">
          <p className="text-[13px] font-bold tabular-nums text-foreground">{leader.personal_leads_added}</p>
          <p className="text-[9px] text-muted-foreground/50">Adds</p>
        </div>
        <div className="text-center">
          <p className="text-[13px] font-bold tabular-nums text-emerald-400">{leader.personal_calls_today}</p>
          <p className="text-[9px] text-muted-foreground/50">Calls</p>
        </div>
        <div className="text-center">
          <p className="text-[13px] font-bold tabular-nums text-foreground">{leader.personal_consistency_score}</p>
          <p className="text-[9px] text-muted-foreground/50">Score</p>
        </div>
      </div>
    </Link>
  )
}

// ── Teams overview row ─────────────────────────────────────────────────────
function TeamRow({ leader }: { leader: LeaderHealthItem }) {
  const isOnline = leader.presence_status === 'online'
  const color = avatarColor(leader.leader_name)
  return (
    <Link to="/dashboard/settings/all-members" className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 no-underline transition-all duration-150 hover:bg-white/[0.05] active:bg-white/[0.08] cursor-pointer">
      {/* Avatar + status */}
      <div className="relative shrink-0">
        <div
          className="flex size-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {initials(leader.leader_name)}
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full border-[1.5px] border-[#1a1c22]',
            isOnline ? 'bg-emerald-400' : 'bg-gray-600',
          )}
        />
      </div>
      {/* Name + team */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-foreground">{leader.leader_name}</p>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[10px] font-medium', isOnline ? 'text-emerald-400' : 'text-muted-foreground/40')}>
            {isOnline ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>
      {/* Activity columns */}
      <div className="flex shrink-0 gap-4">
        <ActivityChip label="Calling" value={leader.personal_calls_today} icon="📞" />
        <ActivityChip label="Team Calls" value={leader.team_calls_today} icon="👥" />
        <ActivityChip label="Day 2" value={leader.day2_leads_count} icon="📚" />
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/30 transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  )
}

function ActivityChip({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex min-w-[52px] flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <span className="text-[10px]">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="text-[13px] font-bold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

// ── Time ago helper ────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const ACTION_COLORS: Record<string, string> = {
  'lead:created': '#5865f2',
  'lead:claimed': '#f0b232',
  'lead:batch_claimed': '#f0b232',
  'lead:transitioned': '#3ba55c',
  lead_state: '#3ba55c',
  'lead:closed': '#f43f5e',
  'wallet:credited': '#10b981',
  'wallet:credited_worker': '#10b981',
  'lead:assigned': '#38bdf8',
  commit_boundary: '#6b7280',
}

const ACTION_ICONS: Record<string, string> = {
  'lead:created': '📥',
  'lead:claimed': '⚑',
  'lead:batch_claimed': '⚑',
  'lead:transitioned': '→',
  lead_state: '→',
  'lead:closed': '🏆',
  'wallet:credited': '💰',
  'wallet:credited_worker': '💰',
  'lead:assigned': '👤',
  commit_boundary: '·',
}

// ── Activity feed ──────────────────────────────────────────────────────────
function LiveActivityFeed() {
  const entries = useAdminFeedStore((s) => s.entries)
  const visible = entries.slice(0, 12)

  if (!visible.length) {
    return (
      <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground/40">
        Waiting for activity…
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-white/[0.04]">
      {visible.map((entry) => {
        const color = ACTION_COLORS[entry.action] ?? '#6b7280'
        const icon = ACTION_ICONS[entry.action] ?? '·'
        return (
          <Link
            key={entry.id}
            to="/dashboard/analytics/activity-log"
            className="flex items-start gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] cursor-pointer"
          >
            {/* Icon dot */}
            <div
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]"
              style={{ backgroundColor: `${color}22`, color }}
            >
              {icon}
            </div>
            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium leading-tight text-foreground/90">
                {entry.description}
              </p>
              {entry.actorName && entry.actorName !== 'Unknown' && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                  By {entry.actorName}
                </p>
              )}
            </div>
            {/* Time */}
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
              {timeAgo(entry.timestamp)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function PeopleOpsPanel() {
  const leaderHealth = useLeaderHealthQuery()
  const leaders = useMemo(
    () =>
      [...(leaderHealth.data?.leaders ?? [])].sort(
        (a, b) => b.personal_consistency_score - a.personal_consistency_score,
      ),
    [leaderHealth.data?.leaders],
  )
  const topLeaders = leaders.slice(0, 5)

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded border border-white/[0.06] bg-card">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground/60">
          People Operations
        </h2>
      </div>

      {/* Top Leaders */}
      <div className="border-b border-white/[0.06] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground/70">Top Leaders (Today)</p>
          <Link to="/dashboard/settings/all-members" className="text-[10px] font-medium text-primary/70 hover:text-primary">
            View all
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {topLeaders.length === 0 &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="min-w-[136px] flex-1 animate-pulse rounded border border-white/[0.06] bg-white/[0.02] py-12" />
            ))}
          {topLeaders.map((leader, i) => (
            <LeaderCard key={leader.leader_id} leader={leader} rank={i + 1} />
          ))}
        </div>
      </div>

      {/* Teams Live Overview */}
      <div className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground/70">Teams Live Overview</p>
          <Link to="/dashboard/settings/all-members" className="text-[10px] font-medium text-primary/70 hover:text-primary">
            View all
          </Link>
        </div>
        <div>
          {leaders.slice(0, 5).map((leader) => (
            <TeamRow key={leader.leader_id} leader={leader} />
          ))}
          {leaderHealth.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse border-b border-white/[0.04] bg-white/[0.02]" />
            ))}
        </div>
      </div>

      {/* Live Activity feed */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-[11px] font-semibold text-muted-foreground/70">Live Activity</p>
          </div>
          <Link to="/dashboard/analytics/activity-log" className="text-[10px] font-medium text-primary/70 hover:text-primary">All Activity</Link>
        </div>
        <LiveActivityFeed />
      </div>
    </div>
  )
}
