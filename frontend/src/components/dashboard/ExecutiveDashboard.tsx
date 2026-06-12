import { AlertCircle, AlertTriangle, BarChart3, CheckCircle2, GraduationCap, ListChecks, Skull, TrendingUp, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useOrganizationScore } from '@/hooks/use-organization-score-query'
import { useLeaderEffectiveness } from '@/hooks/use-leader-effectiveness-query'
import { usePredictiveRisk } from '@/hooks/use-predictive-risk-query'
import { useBlockerIntelligence } from '@/hooks/use-blocker-intelligence-query'
import { useEosHealth } from '@/hooks/use-eos-health-query'

function MetricBox({ label, value, icon, color, suffix }: { label: string; value: string | number; icon: React.ReactNode; color: string; suffix?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', color)}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background/70">{icon}</div>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{value}{suffix}</p>
        <p className="mt-0.5 text-ds-caption opacity-80">{label}</p>
      </div>
    </div>
  )
}

function Gauge({ value, label, size = 120 }: { value: number; label: string; size?: number }) {
  const color = value >= 75 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444'
  const r = 50
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 120 120" className="drop-shadow-sm">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x="60" y="56" textAnchor="middle" className="fill-foreground text-2xl font-bold" dy="0">{value}</text>
        <text x="60" y="76" textAnchor="middle" className="fill-muted-foreground text-[10px]" dy="0">{label}</text>
      </svg>
    </div>
  )
}

export function ExecutiveDashboard() {
  const orgScore = useOrganizationScore()
  const effectiveness = useLeaderEffectiveness()
  const risk = usePredictiveRisk()
  const blocker = useBlockerIntelligence()
  const eos = useEosHealth()

  const isLoading = orgScore.isPending || effectiveness.isPending || risk.isPending || blocker.isPending || eos.isPending

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-4">
          <Skeleton className="size-28 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-60" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    )
  }

  const org = orgScore.data
  const eff = effectiveness.data
  const rsk = risk.data

  const orgScoreValue = org?.overall_score ?? 0
  const avgLeaderScore = eff?.average_score ?? 0
  const leaderCount = eff?.total_leaders ?? 0
  const criticalMembers = rsk?.org_stats.critical_risk ?? 0
  const criticalLeaders = rsk?.leader_risks.filter(l => l.band === 'critical').length ?? 0
  const biggestBlocker = blocker.data?.biggest_blocker_label ?? 'N/A'
  const c = org?.components
  const e = eos.data?.components

  return (
    <div className="space-y-5">
      {/* ── EOS HEALTH BANNER ─────────────────────────────────────────── */}
      {eos.data && (
        <div className={cn(
          'rounded-xl border-2 p-4 flex items-center gap-5',
          eos.data.band === 'excellent' ? 'border-green-300 bg-green-50/50 dark:bg-green-950/10' :
          eos.data.band === 'good' ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/10' :
          eos.data.band === 'fair' ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' :
          'border-red-300 bg-red-50/50 dark:bg-red-950/10'
        )}>
          <Gauge value={Math.round(eos.data.health_score)} label="EOS Health" size={100} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              <span className="text-base font-bold text-foreground">EOS Health Index</span>
              <Badge className={cn(
                'text-[10px]',
                eos.data.band === 'excellent' ? 'bg-green-100 text-green-800' :
                eos.data.band === 'good' ? 'bg-blue-100 text-blue-800' :
                eos.data.band === 'fair' ? 'bg-amber-100 text-amber-800' :
                'bg-red-100 text-red-800'
              )}>{eos.data.band}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-ds-caption">
              <span>Org Score: {e?.org_score}</span>
              <span>Leader Score: {e?.avg_leader_score}</span>
              <span>Mission: {e?.mission_completion}%</span>
              <span>Verification: {e?.verification_rate}%</span>
              <span>Conversion: {e?.conversion_rate}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ROW 1: ORG SCORE + LEADER SCORE ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricBox label="Org Score" value={orgScoreValue} icon={<BarChart3 className="size-4" />}
          color={orgScoreValue >= 60 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 orgScoreValue >= 30 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Leader Score" value={avgLeaderScore} icon={<Users className="size-4" />}
          color={avgLeaderScore >= 60 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 avgLeaderScore >= 30 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Mission Completion" value={c?.mission_completion ?? 0} suffix="%" icon={<ListChecks className="size-4" />}
          color="border-blue-200 bg-blue-50 dark:bg-blue-950/20 text-blue-700" />
        <MetricBox label="Verification Rate" value={c?.verification ?? 0} suffix="%" icon={<CheckCircle2 className="size-4" />}
          color="border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700" />
      </div>

      {/* ── ROW 2 ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricBox label="Conversion Rate" value={e?.conversion_rate ?? 0} suffix="%" icon={<TrendingUp className="size-4" />}
          color={(e?.conversion_rate ?? 0) >= 20 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 (e?.conversion_rate ?? 0) >= 10 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Zombie Score" value={c?.zombie_leads ?? 0} suffix="%" icon={<Skull className="size-4" />}
          color={(c?.zombie_leads ?? 100) >= 70 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 (c?.zombie_leads ?? 100) >= 40 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Critical Members" value={criticalMembers} icon={<AlertCircle className="size-4" />}
          color={criticalMembers === 0 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 criticalMembers <= 5 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Critical Leaders" value={criticalLeaders} icon={<AlertTriangle className="size-4" />}
          color={criticalLeaders === 0 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 criticalLeaders <= 2 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
      </div>

      {/* ── ROW 3 ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricBox label="Biggest Blocker" value={biggestBlocker} icon={<AlertTriangle className="size-4" />}
          color="border-purple-200 bg-purple-50 dark:bg-purple-950/20 text-purple-700" />
        <MetricBox label="Campaign Success" value={e?.campaign_success_pct ?? 0} suffix="%" icon={<GraduationCap className="size-4" />}
          color={(e?.campaign_success_pct ?? 0) >= 60 ? 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700' :
                 (e?.campaign_success_pct ?? 0) >= 30 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700'} />
        <MetricBox label="Active Leaders" value={leaderCount} icon={<Users className="size-4" />}
          color="border-teal-200 bg-teal-50 dark:bg-teal-950/20 text-teal-700" />
      </div>

      {/* ── RISK DISTRIBUTION ────────────────────────────────────────── */}
      {rsk?.org_stats && (
        <Card>
          <CardHeader className="py-3 px-4 pb-0">
            <CardTitle className="text-ds-label shrink-0">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4 px-4 pb-3">
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                Low: {rsk.org_stats.low_risk} ({rsk.org_stats.band_pct_low}%)
              </Badge>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                Medium: {rsk.org_stats.medium_risk} ({rsk.org_stats.band_pct_medium}%)
              </Badge>
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                High: {rsk.org_stats.high_risk} ({rsk.org_stats.band_pct_high}%)
              </Badge>
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                Critical: {rsk.org_stats.critical_risk} ({rsk.org_stats.band_pct_critical}%)
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
