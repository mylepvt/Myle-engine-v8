import { AlertCircle, AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, Search, ShieldAlert, Skull, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePredictiveRisk, type MemberRiskScore, type LeaderRiskScore } from '@/hooks/use-predictive-risk-query'

const BAND_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/20 border-red-200', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  medium: { bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  low: { bg: 'bg-green-50 dark:bg-green-950/20 border-green-200', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  at_risk: { bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  stable: { bg: 'bg-green-50 dark:bg-green-950/20 border-green-200', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
}

function RiskBandBadge({ band }: { band: string }) {
  const s = BAND_STYLES[band] ?? BAND_STYLES.low
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', s.text, s.bg)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {band === 'at_risk' ? 'At Risk' : band}
    </span>
  )
}

function SignalPill({ signal: s }: { signal: { label: string; value: number } }) {
  const color = s.value >= 70 ? 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200' :
               s.value >= 40 ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200' :
               'text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', color)}>
      {s.label}
    </span>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3', color)}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background/80">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-0.5 text-[11px] font-medium">{label}</p>
      </div>
    </div>
  )
}

function MemberRow({ member }: { member: MemberRiskScore }) {
  const [open, setOpen] = useState(false)
  const s = BAND_STYLES[member.band] ?? BAND_STYLES.low
  return (
    <div className={cn('rounded-lg border', s.bg)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={cn('size-2 shrink-0 rounded-full', s.dot)} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{member.name}</span>
        <RiskBandBadge band={member.band} />
        <span className="text-xs font-bold tabular-nums text-muted-foreground">{member.score}</span>
        {open ? <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {open && member.signals.length > 0 && (
        <div className="border-t border-border/40 px-3 pb-2.5 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {member.signals.map((sig, i) => (
              <SignalPill key={i} signal={sig} />
            ))}
          </div>
          <div className="mt-2 space-y-1">
            {member.signals.map((sig, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-1">{sig.detail}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LeaderCard({ leader }: { leader: LeaderRiskScore }) {
  const s = BAND_STYLES[leader.band] ?? BAND_STYLES.stable
  return (
    <Card className={cn('border-2', s.bg)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', s.dot)} />
            <CardTitle className="text-sm font-semibold">{leader.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{leader.team_size} members</Badge>
            <RiskBandBadge band={leader.band} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {leader.signals.map((sig, i) => (
            <SignalPill key={i} signal={sig} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function RiskDashboard() {
  const { data, isPending, isError, refetch } = usePredictiveRisk()
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [tab, setTab] = useState<'members' | 'leaders'>('members')

  const filteredMembers = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    let list = data.member_risks
    if (q) {
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.band.includes(q))
    }
    return [...list].sort((a, b) => sortDir === 'desc' ? b.score - a.score : a.score - b.score)
  }, [data, search, sortDir])

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-10" />
        <Skeleton className="h-60" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load risk data.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  const s = data.org_stats

  return (
    <div className="space-y-5">
      {/* ── ORG RISK OVERVIEW ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Avg Risk Score" value={`${s.avg_member_score}`} icon={<ShieldAlert className="size-4" />}
          color={s.avg_member_score >= 50 ? 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700' :
                 s.avg_member_score >= 25 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' :
                 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700'} />
        <StatCard label={`Critical (${s.critical_risk})`} value={`${s.band_pct_critical}%`} icon={<Skull className="size-4" />}
          color={s.critical_risk > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700' : 'border-border/60 bg-card text-foreground'} />
        <StatCard label={`High (${s.high_risk})`} value={`${s.band_pct_high}%`} icon={<AlertTriangle className="size-4" />}
          color={s.high_risk > 0 ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/20 text-orange-700' : 'border-border/60 bg-card text-foreground'} />
        <StatCard label={`Medium (${s.medium_risk})`} value={`${s.band_pct_medium}%`} icon={<AlertCircle className="size-4" />}
          color={s.medium_risk > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700' : 'border-border/60 bg-card text-foreground'} />
      </div>

      {/* ── LEADER RISKS ──────────────────────────────────────────── */}
      {data.leader_risks.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
            <Users className="size-4 text-primary" />
            Leader Risk
            <Badge variant="secondary" className="ml-1 text-[10px]">{data.leader_risks.length}</Badge>
          </h2>
          <div className="space-y-2">
            {data.leader_risks.map(lr => (
              <LeaderCard key={lr.user_id} leader={lr} />
            ))}
          </div>
        </div>
      )}

      {/* ── MEMBER RISK LIST ──────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <AlertTriangle className="size-4 text-amber-500" />
            Members at Risk
          </h2>
          <Badge variant="secondary" className="ml-1 text-[10px]">{data.member_risks.length}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search member..."
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            >
              <ArrowUpDown className="mr-1 size-3" />
              Score {sortDir === 'desc' ? '↓' : '↑'}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          {filteredMembers.map(m => (
            <MemberRow key={m.user_id} member={m} />
          ))}
          {filteredMembers.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {data.member_risks.length === 0
                ? 'No members at risk detected. All clear!'
                : 'No members match your search.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
