import { useCallback, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  TrendingUp,
  Trophy,
  Users,
  PhoneCall,
  GitPullRequest,
  DollarSign,
  Copy,
  MessageSquare,
  Check,
  Shield,
  Star,
  Zap,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Activity,
} from 'lucide-react'
import {
  usePerformerInsightsQuery,
  type SuggestedMember,
  type FlaggedMember,
} from '@/hooks/use-performer-insights-query'
import { cn } from '@/lib/utils'

type FilterMode = 'all' | 'suggested' | 'active' | 'inactive'

const TREND_COLORS: Record<string, string> = {
  improving: 'text-green-600 bg-green-500/10 border-green-500/20',
  stable: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  declining: 'text-red-600 bg-red-500/10 border-red-500/20',
  inactive: 'text-muted-foreground bg-muted/40 border-muted/30',
}

const TIER_STYLES: Record<string, { icon: React.ReactNode; cls: string }> = {
  elite: {
    icon: <Trophy className="w-4 h-4" />,
    cls: 'bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-600 dark:text-amber-300 border-amber-400/30',
  },
  strong: {
    icon: <Shield className="w-4 h-4" />,
    cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  rising: {
    icon: <TrendingUp className="w-4 h-4" />,
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  developing: {
    icon: <Star className="w-4 h-4" />,
    cls: 'bg-muted/60 text-muted-foreground border-muted/30',
  },
  inactive: {
    icon: <Zap className="w-4 h-4" />,
    cls: 'bg-muted/40 text-muted-foreground/50 border-muted/20',
  },
}

const RISK_STYLES: Record<string, { icon: React.ReactNode; cls: string }> = {
  high: {
    icon: <ShieldAlert className="w-4 h-4" />,
    cls: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
  },
  medium: {
    icon: <AlertTriangle className="w-4 h-4" />,
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  low: {
    icon: <ShieldCheck className="w-4 h-4" />,
    cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
}

function BreakdownBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums font-medium">{Math.round(value)}%</span>
    </div>
  )
}

function SuggestedCard({ member, isElite }: { member: SuggestedMember; isElite: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/20',
        isElite ? 'border-amber-400/40 bg-amber-500/5' : 'border-violet-400/20 bg-violet-500/5',
      )}
    >
      <span className="text-lg shrink-0">{isElite ? '🔥' : '💪'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {member.fbo_id} · Score {member.composite_score}
        </p>
        {member.phone && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">{member.phone}</p>
        )}
      </div>
      <div className="shrink-0 text-xs text-muted-foreground max-w-[140px] text-right leading-tight">
        {member.reason.split('—')[1]?.trim() || member.reason}
      </div>
    </div>
  )
}

type Props = { title?: string }

export default function PerformerInsightsPage({ title = 'Performer Insights' }: Props) {
  const [days, setDays] = useState(30)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [copied, setCopied] = useState(false)
  const { data, isPending, isError, error } = usePerformerInsightsQuery(days)

  const sortedPerformers = useMemo(() => {
    if (!data) return []
    let list = data.performers
    if (filterMode === 'suggested') {
      const suggestedIds = new Set([
        ...data.suggested_group.elite.map((s) => s.user_id),
        ...data.suggested_group.strong.map((s) => s.user_id),
      ])
      list = list.filter((p) => suggestedIds.has(p.user_id))
    } else if (filterMode === 'inactive') {
      list = list.filter((p) => p.tier === 'inactive' || p.trend === 'inactive')
    } else if (filterMode === 'active') {
      list = list.filter((p) => p.tier !== 'inactive' && p.trend !== 'inactive')
    }
    return list
  }, [data, filterMode])

  const handleCopyNumbers = useCallback(async () => {
    if (!data?.suggested_group.all_phones.length) return
    const text = data.suggested_group.all_phones.join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [data])

  const handleCopyNamesAndNumbers = useCallback(async () => {
    if (!data) return
    const lines = [
      data.suggested_group.whatsapp_group_intro,
      '',
      '🔥 *ELITE PERFORMERS*',
      ...data.suggested_group.elite.map(
        (m) => `${m.phone || '—'}  ${m.name} (${m.fbo_id})`,
      ),
      '',
      '💪 *STRONG PERFORMERS*',
      ...data.suggested_group.strong.map(
        (m) => `${m.phone || '—'}  ${m.name} (${m.fbo_id})`,
      ),
      '',
      `Total: ${data.suggested_group.total_count} members`,
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [data])

  const handleOpenWhatsAppGroup = useCallback(() => {
    if (!data?.suggested_group.all_phones.length) return
    const first = data.suggested_group.all_phones[0]
    if (first) {
      window.open(
        `https://wa.me/${first.replace('+', '')}?text=Hi!%20Join%20our%20Top%20Performers%20group%20%F0%9F%8F%86`,
        '_blank',
      )
    }
  }, [data])

  if (isPending) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <div
          className="rounded border border-red-600/20 bg-red-600/5 p-4 text-sm text-red-600"
          role="alert"
        >
          {error instanceof Error ? error.message : 'Failed to load performer insights'}
        </div>
      </div>
    )
  }

  if (!data) return null

  const suggested = data.suggested_group
  const audit = data.integrity_audit
  const atRisk = data.elite_at_risk

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Statistical engine ranking genuine contributors with integrity audit &amp; elite risk prediction
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1.5 border rounded-md text-sm bg-background"
          >
            <option value={7}>Last 7 days</option>
            <option value={10}>Last 10 days</option>
            <option value={15}>Last 15 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={<Users className="w-4 h-4" />} label="Total Members" value={data.total_members} />
        <SummaryCard icon={<PhoneCall className="w-4 h-4 text-green-600" />} label="Active (reported)" value={data.active_members} />
        <SummaryCard icon={<Trophy className="w-4 h-4 text-amber-600" />} label="Top Performers" value={data.top_performer_count} />
        <SummaryCard icon={<TrendingUp className="w-4 h-4 text-blue-600" />} label="Avg Score" value={`${data.average_score}`} />
        <SummaryCard icon={<Star className="w-4 h-4 text-violet-600" />} label="Median Score" value={`${data.median_score}`} />
      </div>

      {/* Tier distribution */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.tier_distribution).map(([tier, count]) => {
          const style = TIER_STYLES[tier]
          return (
            <Badge key={tier} variant="outline" className={cn('gap-1 px-2.5 py-1 text-xs', style?.cls)}>
              {style?.icon}
              {tier}: {count}
            </Badge>
          )
        })}
        {audit.total_flagged > 0 && (
          <Badge variant="outline" className="gap-1 px-2.5 py-1 text-xs bg-red-500/10 text-red-600 border-red-500/20">
            <AlertTriangle className="w-4 h-4" />
            {audit.total_flagged} flagged
          </Badge>
        )}
        {atRisk.total_at_risk > 0 && (
          <Badge variant="outline" className="gap-1 px-2.5 py-1 text-xs bg-amber-500/15 text-amber-600 border-amber-500/20">
            <Activity className="w-4 h-4" />
            {atRisk.total_at_risk} at risk
          </Badge>
        )}
      </div>

      {/* ─────────────────── ELITE AT RISK ─────────────────── */}
      {atRisk.total_at_risk > 0 && (
        <Card className="border-amber-400/30">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" />
                Elite at Risk — Top performers going inactive
              </span>
              <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-600 border-amber-500/20">
                {atRisk.total_at_risk} at risk
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              These elite/strong members have stopped working. Risk is calculated from inactivity duration + grace abuse history.
            </p>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 space-y-2.5">
            {atRisk.members.map((m) => {
              const riskStyle = RISK_STYLES[m.risk_level] || RISK_STYLES.low
              return (
                <div
                  key={m.user_id}
                  className={cn(
                    'rounded-lg border p-3',
                    m.risk_level === 'high' ? 'border-red-400/30 bg-red-500/[0.03]' : 'border-amber-400/20 bg-amber-500/[0.02]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', riskStyle.cls)}>
                          {riskStyle.icon}
                          {m.risk_level.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.fbo_id}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{m.suggested_action}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        <span>⏱ {m.days_since_activity}d inactive</span>
                        <span>🏆 Score {m.composite_score}</span>
                        <span>📅 Last active: {m.last_active_date}</span>
                        <span className={cn(m.grace_risk !== 'low' ? 'text-red-500' : '')}>
                          Grace risk: {m.grace_risk} ({m.grace_count_30d}/30d)
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-1.5">
                      {m.whatsapp_link && (
                        <a
                          href={m.whatsapp_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs text-white hover:bg-green-700 transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────── INTEGRITY AUDIT ─────────────────── */}
      {audit.total_flagged > 0 && (
        <Card className="border-red-200/40 dark:border-red-900/30">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Integrity Audit — Report vs Reality
              </span>
              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                Trust score: {audit.average_trust_score}%
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Cross-checking self-reported calls ({'{'}DailyReport.total_calling{'}'}) against system-logged call events ({'{'}CallEvent{'}'}).
              Flagged members have &lt;70% trust score. Scores are capped at 40 for trust &lt;50%.
            </p>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 space-y-2">
            {audit.flagged_members.map((m: FlaggedMember) => {
              const trustColor = m.trust_score < 30 ? 'bg-red-500' : m.trust_score < 50 ? 'bg-orange-500' : 'bg-amber-500'
              return (
                <div key={m.user_id} className="rounded-lg border border-red-200/30 dark:border-red-900/20 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.fbo_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        trustColor.replace('bg-', 'bg-').replace('red-500', 'red-500/15 text-red-600').replace('orange-500', 'orange-500/15 text-orange-600').replace('amber-500', 'amber-500/15 text-amber-600'),
                      )}>
                        Trust: {m.trust_score}%
                      </span>
                      <Badge variant="outline" className={cn('text-[10px]', TIER_STYLES[m.tier]?.cls)}>
                        {m.tier}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Reported calls</span>
                      <p className="font-semibold tabular-nums">{m.reported_calls}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actual calls (system)</span>
                      <p className="font-semibold tabular-nums text-green-600">{m.actual_calls}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Discrepancy</span>
                      <p className={cn('font-semibold tabular-nums', m.discrepancy > 0 ? 'text-red-600' : 'text-green-600')}>
                        {m.discrepancy > 0 ? '+' : ''}{m.discrepancy}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Discrepancy %</span>
                      <p className={cn('font-semibold tabular-nums', m.discrepancy_pct > 20 ? 'text-red-600' : 'text-amber-600')}>
                        {m.discrepancy_pct > 0 ? '+' : ''}{m.discrepancy_pct}%
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────── WHATSAPP GROUP ─────────────────── */}
      {suggested.total_count > 0 && (
        <Card className="border-amber-400/30">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                Suggested for WhatsApp Top Performers Group
              </span>
              <Badge variant="default" className="bg-green-600 text-white text-xs">
                {suggested.total_count} members
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyNumbers} className="text-xs gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy All Numbers'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyNamesAndNumbers} className="text-xs gap-1.5">
                <Copy className="w-3.5 h-3.5" />
                Copy Names + Numbers
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenWhatsAppGroup}
                className="text-xs gap-1.5 bg-green-600 hover:bg-green-700"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Open WhatsApp
              </Button>
            </div>
            {suggested.elite.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> Elite ({suggested.elite.length})
                </h4>
                <div className="space-y-1.5">
                  {suggested.elite.map((m) => (
                    <SuggestedCard key={m.user_id} member={m} isElite />
                  ))}
                </div>
              </div>
            )}
            {suggested.strong.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-violet-600 mb-2 flex items-center gap-1.5">
                  <Shield className="w-4 h-4" /> Strong ({suggested.strong.length})
                </h4>
                <div className="space-y-1.5">
                  {suggested.strong.map((m) => (
                    <SuggestedCard key={m.user_id} member={m} isElite={false} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────── INACTIVE MEMBERS ─────────────────── */}
      {data.tier_distribution.inactive > 0 && (
        <Card className="border-red-200/40 dark:border-red-900/30">
          <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                Inactive Members
              </span>
              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                {data.tier_distribution.inactive} members
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              No activity in the last {days} days — no reports, calls, or leads
            </p>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {data.performers
                .filter((p) => p.tier === 'inactive')
                .slice(0, 24)
                .map((p) => (
                  <div key={p.user_id} className="rounded border border-dashed border-muted-300/50 p-2 text-center">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.fbo_id}</p>
                    {p.phone && <p className="text-[10px] text-muted-foreground/60 font-mono">{p.phone}</p>}
                  </div>
                ))}
              {data.tier_distribution.inactive > 24 && (
                <p className="text-xs text-muted-foreground col-span-full text-center pt-1">
                  +{data.tier_distribution.inactive - 24} more — switch to "Inactive Only" filter to see all
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────── FULL RANKING ─────────────────── */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Full Ranking ({data.period_days}-day period)</span>
            <div className="flex items-center gap-2">
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                className="px-2 py-1 border rounded text-xs bg-background"
              >
                <option value="all">All Members</option>
                <option value="active">Active</option>
                <option value="suggested">Top Performers</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <Badge variant="outline" className="text-xs font-normal">
                {sortedPerformers.length} members
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6 pb-4">
          {sortedPerformers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No performer data for this period.</p>
          ) : (
            <div className="space-y-2">
              {sortedPerformers.map((p) => {
                const tierStyle = TIER_STYLES[p.tier] || TIER_STYLES.developing
                return (
                  <div
                    key={p.user_id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors hover:bg-muted/20',
                      p.rank <= 3 ? 'border-amber-400/30 bg-amber-500/[0.03]' : 'border-border',
                      filterMode !== 'all' && 'border-green-400/30',
                      p.trust_score < 50 && 'border-l-red-400',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0',
                            p.rank <= 3 ? 'bg-amber-500/20 text-amber-600' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `#${p.rank}`}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.fbo_id} · {p.role}
                          </p>
                          {p.phone && (
                            <p className="text-xs text-muted-foreground/60 font-mono">{p.phone}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.trust_score < 70 && (
                          <span className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            p.trust_score < 30
                              ? 'bg-red-500/15 text-red-600'
                              : 'bg-amber-500/15 text-amber-600',
                          )}>
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            {p.trust_score}%
                          </span>
                        )}
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            tierStyle.cls,
                          )}
                        >
                          {tierStyle.icon}
                          {p.tier}
                        </span>
                        <span className="text-lg font-bold tabular-nums">{p.composite_score}</span>
                      </div>
                    </div>

                    <div className="space-y-1 mb-2">
                      <BreakdownBar value={p.breakdown.consistency} label="Consistency" color="bg-blue-500" />
                      <BreakdownBar value={p.breakdown.call_activity} label="Call Volume" color="bg-emerald-500" />
                      <BreakdownBar value={p.breakdown.pickup_rate} label="Pickup Rate" color="bg-teal-500" />
                      <BreakdownBar value={p.breakdown.lead_education} label="Lead Education" color="bg-violet-500" />
                      <BreakdownBar value={p.breakdown.pipeline_conversion} label="Pipeline Conv." color="bg-orange-500" />
                      <BreakdownBar value={p.breakdown.results} label="Results" color="bg-rose-500" />
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {p.metrics.submission_days}/{data.period_days}d reports
                      </span>
                      <span className="flex items-center gap-1">
                        <PhoneCall className="w-3 h-3" /> {p.metrics.total_calls} calls
                      </span>
                      <span className={cn(p.metrics.total_calls > p.metrics.actual_calls ? 'text-red-500' : 'text-green-600')}>
                        ({p.metrics.actual_calls} system)
                      </span>
                      <span>{p.metrics.pickup_rate}% picked</span>
                      <span className="flex items-center gap-1">
                        <GitPullRequest className="w-3 h-3" /> {p.metrics.pipeline_total} pipeline
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> {p.metrics.payments} payments
                      </span>
                      <span>{p.metrics.leads_taken} leads</span>
                      <span>{p.metrics.converted_leads} conv</span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', TREND_COLORS[p.trend] || '')}
                      >
                        {p.trend === 'inactive'
                          ? 'Inactive'
                          : `${p.trend} (${p.trend_pct > 0 ? '+' : ''}${p.trend_pct}%)`}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
