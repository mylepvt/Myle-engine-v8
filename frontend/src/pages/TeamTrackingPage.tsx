import { useDeferredValue, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowDownWideNarrow,
  Gauge,
  Layers3,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useTeamTrackingOverviewQuery,
  type TeamTrackingMemberSummary,
} from '@/hooks/use-team-tracking-query'
import { filterCollectionByQuery, type SearchableValue } from '@/lib/search-filter'
import { cn } from '@/lib/utils'

type Props = { title: string }

type PresenceFilter = 'all' | TeamTrackingMemberSummary['presence_status']
type BandFilter = 'all' | TeamTrackingMemberSummary['consistency_band']
type SortMode =
  | 'attention'
  | 'score-desc'
  | 'score-asc'
  | 'activity-desc'
  | 'last-seen-desc'
  | 'name'

type LeaderHealthSnapshot = {
  key: string
  label: string
  teamSize: number
  liveCount: number
  highCount: number
  averageScore: number
  attentionCount: number
}

type MetricPanelProps = {
  icon: typeof Users
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const SELECT_CLASSNAME =
  'h-10 rounded-xl border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20'

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not seen yet'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'No heartbeat'
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return value
  const diffMs = Date.now() - ts
  if (diffMs < 10_000) return 'Just now'
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return `${Math.max(1, Math.floor(diffMs / 1_000))}s ago`
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function presenceVariant(status: TeamTrackingMemberSummary['presence_status']) {
  if (status === 'online') return 'success' as const
  if (status === 'idle') return 'warning' as const
  return 'outline' as const
}

function scoreVariant(band: TeamTrackingMemberSummary['consistency_band']) {
  if (band === 'high') return 'success' as const
  if (band === 'medium') return 'warning' as const
  return 'danger' as const
}

function complianceVariant(level: TeamTrackingMemberSummary['compliance_level']) {
  if (level === 'removed') return 'danger' as const
  if (level === 'final_warning' || level === 'strong_warning') return 'warning' as const
  if (level === 'warning') return 'primary' as const
  if (level === 'grace' || level === 'grace_ending') return 'outline' as const
  if (level === 'clear') return 'success' as const
  return 'secondary' as const
}

function complianceRank(level: TeamTrackingMemberSummary['compliance_level']) {
  if (level === 'removed') return 5
  if (level === 'final_warning') return 4
  if (level === 'strong_warning') return 3
  if (level === 'warning') return 2
  if (level === 'grace_ending') return 1
  return 0
}

function presenceRank(status: TeamTrackingMemberSummary['presence_status']) {
  if (status === 'online') return 0
  if (status === 'idle') return 1
  return 2
}

function toTimestamp(value: string | null) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function totalOutput(item: TeamTrackingMemberSummary) {
  return item.login_count + item.calls_count + item.leads_added_count + item.followups_done_count
}

function averageScore(items: TeamTrackingMemberSummary[]) {
  if (items.length === 0) return 0
  return Math.round(items.reduce((sum, item) => sum + item.consistency_score, 0) / items.length)
}

function memberSearchValues(item: TeamTrackingMemberSummary): SearchableValue[] {
  return [
    item.member_name,
    item.member_username,
    item.member_email,
    item.member_phone,
    item.member_fbo_id,
    item.member_role,
    item.leader_name,
    item.upline_name,
    item.upline_fbo_id,
    item.compliance_title,
    item.compliance_summary,
    ...item.insights,
  ]
}

function attentionScore(item: TeamTrackingMemberSummary) {
  let score = 0
  if (item.presence_status === 'offline') score += 5
  else if (item.presence_status === 'idle') score += 2
  if (item.consistency_band === 'low') score += 4
  else if (item.consistency_band === 'medium') score += 1
  score += complianceRank(item.compliance_level)
  if (item.calls_count === 0) score += 1
  if (item.followups_done_count === 0) score += 1
  if (item.last_activity_at === null) score += 2
  score += Math.min(item.insights.length, 3)
  return score
}

function sortMembers(items: TeamTrackingMemberSummary[], mode: SortMode) {
  return [...items].sort((a, b) => {
    if (mode === 'score-desc') {
      return (
        b.consistency_score - a.consistency_score ||
        totalOutput(b) - totalOutput(a) ||
        a.member_name.localeCompare(b.member_name)
      )
    }
    if (mode === 'score-asc') {
      return (
        a.consistency_score - b.consistency_score ||
        totalOutput(a) - totalOutput(b) ||
        a.member_name.localeCompare(b.member_name)
      )
    }
    if (mode === 'activity-desc') {
      return (
        totalOutput(b) - totalOutput(a) ||
        b.consistency_score - a.consistency_score ||
        a.member_name.localeCompare(b.member_name)
      )
    }
    if (mode === 'last-seen-desc') {
      return (
        toTimestamp(b.last_seen_at) - toTimestamp(a.last_seen_at) ||
        presenceRank(a.presence_status) - presenceRank(b.presence_status) ||
        a.member_name.localeCompare(b.member_name)
      )
    }
    if (mode === 'name') {
      return a.member_name.localeCompare(b.member_name)
    }
    return (
      attentionScore(b) - attentionScore(a) ||
      presenceRank(a.presence_status) - presenceRank(b.presence_status) ||
      a.consistency_score - b.consistency_score ||
      a.member_name.localeCompare(b.member_name)
    )
  })
}

function liveNowItems(items: TeamTrackingMemberSummary[]) {
  return [...items]
    .filter((item) => item.presence_status !== 'offline')
    .sort(
      (a, b) =>
        presenceRank(a.presence_status) - presenceRank(b.presence_status) ||
        toTimestamp(b.last_seen_at) - toTimestamp(a.last_seen_at) ||
        b.consistency_score - a.consistency_score,
    )
    .slice(0, 8)
}

function attentionQueue(items: TeamTrackingMemberSummary[]) {
  return [...items]
    .filter(
      (item) =>
        attentionScore(item) > 0 &&
        (item.presence_status !== 'online' ||
          item.consistency_band === 'low' ||
          item.insights.length > 0),
    )
    .sort(
      (a, b) =>
        attentionScore(b) - attentionScore(a) ||
        a.consistency_score - b.consistency_score ||
        toTimestamp(a.last_activity_at) - toTimestamp(b.last_activity_at),
    )
    .slice(0, 8)
}

function buildLeaderHealth(items: TeamTrackingMemberSummary[]) {
  const groups = new Map<string, TeamTrackingMemberSummary[]>()
  items.forEach((item) => {
    const key = item.leader_user_id ? String(item.leader_user_id) : 'unassigned'
    const current = groups.get(key)
    if (current) current.push(item)
    else groups.set(key, [item])
  })
  return [...groups.entries()]
    .map(([key, members]): LeaderHealthSnapshot => ({
      key,
      label: members[0]?.leader_name ?? 'No mapped leader',
      teamSize: members.length,
      liveCount: members.filter((item) => item.presence_status !== 'offline').length,
      highCount: members.filter((item) => item.consistency_band === 'high').length,
      averageScore: averageScore(members),
      attentionCount: members.filter((item) => attentionScore(item) >= 4).length,
    }))
    .sort(
      (a, b) =>
        b.attentionCount - a.attentionCount ||
        a.liveCount - b.liveCount ||
        b.teamSize - a.teamSize ||
        a.label.localeCompare(b.label),
    )
}

function liveBadgeClass(status: TeamTrackingMemberSummary['presence_status']) {
  if (status === 'online') return 'bg-emerald-400'
  if (status === 'idle') return 'bg-amber-400'
  return 'bg-slate-400'
}

function scoreRailClass(band: TeamTrackingMemberSummary['consistency_band']) {
  if (band === 'high') return 'bg-emerald-400/90'
  if (band === 'medium') return 'bg-amber-400/90'
  return 'bg-rose-400/90'
}

function updateParam(
  params: URLSearchParams,
  setParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params)
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'all') next.delete(key)
  else next.set(key, trimmed)
  setParams(next, { replace: true })
}

function MetricPanel({ icon: Icon, label, value, tone = 'default' }: MetricPanelProps) {
  return (
    <Card className="surface-elevated overflow-hidden border-white/[0.08]">
      <CardContent className="relative p-4">
        <div
          className={cn(
            'absolute right-3 top-3 rounded-2xl p-2',
            tone === 'success' && 'bg-emerald-400/12 text-emerald-300',
            tone === 'warning' && 'bg-amber-400/12 text-amber-300',
            tone === 'danger' && 'bg-rose-400/12 text-rose-300',
            tone === 'default' && 'bg-white/[0.06] text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}

function LiveMemberRow({ item, dateIso }: { item: TeamTrackingMemberSummary; dateIso: string }) {
  return (
    <Link
      to={`/dashboard/team/tracking/${item.user_id}?date=${encodeURIComponent(dateIso)}`}
      className="group flex items-start justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 transition hover:border-primary/30 hover:bg-white/[0.05]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground group-hover:text-primary">{item.member_name}</span>
          <Badge variant={presenceVariant(item.presence_status)}>{item.presence_status}</Badge>
          {item.compliance_title && item.compliance_level !== 'clear' && item.compliance_level !== 'not_applicable' ? (
            <Badge variant={complianceVariant(item.compliance_level)}>{item.compliance_title}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.member_fbo_id}
          {item.leader_name ? ` · leader ${item.leader_name}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{item.consistency_score}</p>
        <p>{formatRelativeTime(item.last_seen_at)}</p>
      </div>
    </Link>
  )
}

function AttentionRow({ item, dateIso }: { item: TeamTrackingMemberSummary; dateIso: string }) {
  const reasons = [
    item.presence_status !== 'online' ? item.presence_status : null,
    item.consistency_band === 'low' ? 'low score' : null,
    item.calls_count === 0 ? 'no calls' : null,
    item.followups_done_count === 0 ? 'no follow-up' : null,
    item.insights[0] ?? null,
  ].filter(Boolean) as string[]

  return (
    <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/dashboard/team/tracking/${item.user_id}?date=${encodeURIComponent(dateIso)}`}
              className="font-medium text-foreground transition hover:text-primary"
            >
              {item.member_name}
            </Link>
            <Badge variant={presenceVariant(item.presence_status)}>{item.presence_status}</Badge>
            <Badge variant={scoreVariant(item.consistency_band)}>{item.consistency_score}</Badge>
            {item.compliance_title && item.compliance_level !== 'clear' && item.compliance_level !== 'not_applicable' ? (
              <Badge variant={complianceVariant(item.compliance_level)}>{item.compliance_title}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.leader_name ? `${item.leader_name} · ` : ''}
            last activity {formatRelativeTime(item.last_activity_at)}
          </p>
        </div>
        <div className="rounded-full border border-rose-400/20 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-rose-200">
          priority
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {reasons.slice(0, 3).map((reason) => (
          <Badge key={reason} variant="secondary" className="bg-white/[0.08] text-foreground">
            {reason}
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function TeamTrackingPage({ title }: Props) {
  const [params, setParams] = useSearchParams()
  const dateIso = params.get('date') || todayIsoLocal()
  const searchQuery = params.get('q') || ''
  const presenceFilter = (params.get('presence') as PresenceFilter | null) ?? 'all'
  const bandFilter = (params.get('band') as BandFilter | null) ?? 'all'
  const leaderFilter = params.get('leader') || 'all'
  const sortMode = (params.get('sort') as SortMode | null) ?? 'attention'
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const { data, isPending, isError, error, refetch } = useTeamTrackingOverviewQuery(dateIso)

  const leaderOptions = useMemo(() => {
    const leaderMap = new Map<string, string>()
    data?.items.forEach((item) => {
      const key = item.leader_user_id ? String(item.leader_user_id) : 'unassigned'
      if (!leaderMap.has(key)) {
        leaderMap.set(key, item.leader_name ?? 'No mapped leader')
      }
    })
    return [...leaderMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [data])

  const filteredItems = useMemo(() => {
    if (!data) return []
    const searched = filterCollectionByQuery(
      data.items,
      deferredSearchQuery,
      memberSearchValues,
    )
    return sortMembers(
      searched.filter((item) => {
        if (presenceFilter !== 'all' && item.presence_status !== presenceFilter) return false
        if (bandFilter !== 'all' && item.consistency_band !== bandFilter) return false
        if (leaderFilter === 'unassigned') return item.leader_user_id === null
        if (leaderFilter !== 'all' && String(item.leader_user_id ?? '') !== leaderFilter) return false
        return true
      }),
      sortMode,
    )
  }, [bandFilter, data, deferredSearchQuery, leaderFilter, presenceFilter, sortMode])

  const liveNow = useMemo(() => liveNowItems(filteredItems), [filteredItems])
  const flagged = useMemo(() => attentionQueue(filteredItems), [filteredItems])
  const leaderHealth = useMemo(() => buildLeaderHealth(filteredItems), [filteredItems])

  const filteredLiveCount = filteredItems.filter((item) => item.presence_status !== 'offline').length
  const filteredHighCount = filteredItems.filter((item) => item.consistency_band === 'high').length
  const filteredMediumCount = filteredItems.filter((item) => item.consistency_band === 'medium').length
  const filteredLowCount = filteredItems.filter((item) => item.consistency_band === 'low').length
  const activeFilters =
    searchQuery.trim().length > 0 ||
    presenceFilter !== 'all' ||
    bandFilter !== 'all' ||
    leaderFilter !== 'all' ||
    sortMode !== 'attention'

  return (
    <div className="max-w-[88rem] space-y-5">
      <section className="surface-elevated overflow-hidden px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Live status, activity, and daily performance for the selected team.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
              {filteredItems.length} visible
            </Badge>
            <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
              {filteredLiveCount} live now
            </Badge>
            <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
              {flagged.length} need attention
            </Badge>
            <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
              High {filteredHighCount} · Medium {filteredMediumCount} · Low {filteredLowCount}
            </Badge>
          </div>
        </div>
      </section>

      <section className="surface-elevated space-y-4 border border-white/[0.08] px-4 py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1.25fr)_12rem]">
          <ListSearchInput
            value={searchQuery}
            onValueChange={(value) => updateParam(params, setParams, 'q', value)}
            placeholder="Search member, FBO ID, leader, email, or insight"
            aria-label="Search tracked members"
            wrapperClassName="w-full"
          />

          <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>Date</span>
            <input
              type="date"
              value={dateIso}
              onChange={(event) => updateParam(params, setParams, 'date', event.target.value)}
              className={cn(SELECT_CLASSNAME, 'w-full')}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>Presence</span>
            <select
              value={presenceFilter}
              onChange={(event) => updateParam(params, setParams, 'presence', event.target.value)}
              className={SELECT_CLASSNAME}
            >
              <option value="all">All states</option>
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="offline">Offline</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>Consistency</span>
            <select
              value={bandFilter}
              onChange={(event) => updateParam(params, setParams, 'band', event.target.value)}
              className={SELECT_CLASSNAME}
            >
              <option value="all">All bands</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>Leader</span>
            <select
              value={leaderFilter}
              onChange={(event) => updateParam(params, setParams, 'leader', event.target.value)}
              className={SELECT_CLASSNAME}
            >
              <option value="all">All leaders</option>
              <option value="unassigned">No mapped leader</option>
              {leaderOptions.map((leader) => (
                <option key={leader.value} value={leader.value}>
                  {leader.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={(event) => updateParam(params, setParams, 'sort', event.target.value)}
              className={SELECT_CLASSNAME}
            >
              <option value="attention">Attention first</option>
              <option value="activity-desc">Most activity</option>
              <option value="score-desc">Best score</option>
              <option value="score-asc">Lowest score</option>
              <option value="last-seen-desc">Latest seen</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
            {data?.scope_total_members ?? filteredItems.length} members
          </Badge>
          <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
            Timezone {data?.timezone ?? 'Asia/Kolkata'}
          </Badge>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowDownWideNarrow className="size-3.5" />
            Sorted by {sortMode.replace('-', ' ')}
          </div>
          {activeFilters ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setParams(new URLSearchParams([['date', dateIso]]), { replace: true })}
            >
              Reset filters
            </Button>
          ) : null}
        </div>
      </section>

      {isPending ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-[32rem] rounded-2xl" />
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricPanel
              icon={Users}
              label="Members in scope"
              value={data.scope_total_members}
            />
            <MetricPanel
              icon={Activity}
              label="Live now"
              value={filteredLiveCount}
              tone="success"
            />
            <MetricPanel
              icon={ShieldAlert}
              label="Need attention"
              value={flagged.length}
              tone="danger"
            />
            <MetricPanel
              icon={Gauge}
              label="Average score"
              value={averageScore(filteredItems)}
              tone="warning"
            />
            <MetricPanel
              icon={Activity}
              label="High performers"
              value={filteredHighCount}
              tone="success"
            />
            <MetricPanel
              icon={Layers3}
              label="Leader lanes"
              value={leaderHealth.length}
            />
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="surface-elevated overflow-hidden rounded-2xl border border-white/[0.08]">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Live floor</p>
                  <p className="text-xs text-muted-foreground">
                    Online and idle members sorted by freshness and score.
                  </p>
                </div>
                <Badge variant="success">{liveNow.length} visible</Badge>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {liveNow.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.1] px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2">
                    No live members match these filters right now.
                  </div>
                ) : (
                  liveNow.map((item) => <LiveMemberRow key={item.user_id} item={item} dateIso={data.date} />)
                )}
              </div>
            </section>

            <section className="surface-elevated overflow-hidden rounded-2xl border border-white/[0.08]">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Attention queue</p>
                  <p className="text-xs text-muted-foreground">
                    Members who likely need intervention first.
                  </p>
                </div>
                <Badge variant="danger">{flagged.length} queued</Badge>
              </div>
              <div className="space-y-3 p-4">
                {flagged.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.1] px-4 py-10 text-center text-sm text-muted-foreground">
                    Nothing urgent in the current filter set.
                  </div>
                ) : (
                  flagged.map((item) => <AttentionRow key={item.user_id} item={item} dateIso={data.date} />)
                )}
              </div>
            </section>
          </div>

          <section className="surface-elevated overflow-hidden rounded-2xl border border-white/[0.08]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Leader health</p>
                <p className="text-xs text-muted-foreground">
                  Which lanes are healthy, live, and slipping.
                </p>
              </div>
              <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
                Ranked by attention load
              </Badge>
            </div>

            {leaderHealth.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No leader groups match the active filters.
              </div>
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {leaderHealth.map((leader) => (
                  <Card key={leader.key} className="border-white/[0.08] bg-white/[0.03]">
                    <CardHeader className="space-y-2 pb-3">
                      <CardTitle className="text-base">{leader.label}</CardTitle>
                      <CardDescription>
                        {leader.teamSize} member{leader.teamSize === 1 ? '' : 's'} in view
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                          <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                            Live
                          </p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{leader.liveCount}</p>
                        </div>
                        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                          <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                            Avg score
                          </p>
                          <p className="mt-1 text-lg font-semibold text-foreground">
                            {leader.averageScore}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">{leader.highCount} high</Badge>
                        <Badge variant={leader.attentionCount > 0 ? 'danger' : 'secondary'}>
                          {leader.attentionCount} attention
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="surface-elevated overflow-hidden rounded-2xl border border-white/[0.08]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">All members</p>
                <p className="text-xs text-muted-foreground">
                  Dense table for quick scanning, sorting, and drill-down.
                </p>
              </div>
              <Badge variant="secondary" className="bg-white/[0.06] text-foreground">
                {filteredItems.length} rows
              </Badge>
            </div>

            {filteredItems.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No members match the current filters.
              </div>
            ) : (
              <div className="max-h-[42rem] overflow-auto">
                <Table className="min-w-[78rem]">
                  <TableHeader className="sticky top-0 z-[1] bg-surface/90 backdrop-blur">
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Leader lane</TableHead>
                      <TableHead>Live state</TableHead>
                      <TableHead>Activity today</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Signals</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.user_id}>
                        <TableCell className="py-3">
                          <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                  'size-2.5 rounded-full',
                                  liveBadgeClass(item.presence_status),
                                )}
                              />
                              <span className="font-medium text-foreground">{item.member_name}</span>
                              <Badge variant={scoreVariant(item.consistency_band)}>
                                {item.consistency_band}
                              </Badge>
                              {item.compliance_title && item.compliance_level !== 'not_applicable' ? (
                                <Badge variant={complianceVariant(item.compliance_level)}>
                                  {item.compliance_title}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="font-mono">{item.member_fbo_id}</span>
                              <span>{item.member_email}</span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-sm">
                          <p className="font-medium text-foreground">
                            {item.leader_name ?? 'No mapped leader'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.upline_name ?? 'No direct parent mapped'}
                          </p>
                        </TableCell>

                        <TableCell className="py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={presenceVariant(item.presence_status)}>
                              {item.presence_status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(item.last_seen_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last seen {formatDateTime(item.last_seen_at)}
                          </p>
                        </TableCell>

                        <TableCell className="py-3 text-sm">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Logins <span className="text-foreground">{item.login_count}</span>
                            </span>
                            <span>
                              Calls <span className="text-foreground">{item.calls_count}</span>
                            </span>
                            <span>
                              Leads{' '}
                              <span className="text-foreground">{item.leads_added_count}</span>
                            </span>
                            <span>
                              Follow-ups{' '}
                              <span className="text-foreground">{item.followups_done_count}</span>
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Last activity {formatRelativeTime(item.last_activity_at)}
                          </p>
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-semibold text-foreground">
                                {item.consistency_score}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {item.consistency_band}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-white/[0.08]">
                              <div
                                className={cn('h-2 rounded-full', scoreRailClass(item.consistency_band))}
                                style={{ width: `${Math.max(6, item.consistency_score)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="py-3">
                          {item.insights.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Stable lane</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {item.insights.slice(0, 2).map((insight) => (
                                <Badge key={insight} variant="secondary">
                                  {insight}
                                </Badge>
                              ))}
                              {item.insights.length > 2 ? (
                                <Badge variant="secondary">+{item.insights.length - 2}</Badge>
                              ) : null}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to={`/dashboard/team/tracking/${item.user_id}?date=${encodeURIComponent(data.date)}`}
                            >
                              Open
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
