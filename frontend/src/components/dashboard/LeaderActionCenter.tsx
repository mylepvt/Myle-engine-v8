import { cn } from '@/lib/utils'
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, GraduationCap, ListChecks, Phone, MessageSquare, Skull, Users, Eye, Send } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaderCommandCenter, type ActionItem } from '@/hooks/use-leader-command-center-query'

const ACTION_BUTTONS: Record<string, { label: string; icon: typeof Phone; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  call: { label: 'Call', icon: Phone, variant: 'default' },
  verify: { label: 'Verify', icon: CheckCircle2, variant: 'secondary' },
  review: { label: 'Review', icon: Eye, variant: 'outline' },
  message: { label: 'Message', icon: MessageSquare, variant: 'secondary' },
  follow_up: { label: 'Follow Up', icon: Send, variant: 'outline' },
}

function KpiCard({ label, value, icon, variant }: { label: string; value: number | string; icon: React.ReactNode; variant: 'danger' | 'warning' | 'success' | 'info' }) {
  const styles = {
    danger: 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300',
    warning: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
    success: 'border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300',
    info: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300',
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', styles[variant])}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background/70">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-0.5 text-ds-caption opacity-80">{label}</p>
      </div>
    </div>
  )
}

function HealthBar({ label, value, max }: { label: string; value: number; max?: number }) {
  const pct = max ? (value / max) * 100 : value
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-ds-caption font-medium">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-ds-caption font-bold tabular-nums">{Math.round(value)}</span>
    </div>
  )
}

function ActionCard({ action }: { action: ActionItem }) {
  const severityColor = action.severity === 'critical'
    ? 'border-red-200 bg-red-50/60 dark:bg-red-950/10'
    : action.severity === 'warning'
    ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/10'
    : 'border-blue-200 bg-blue-50/60 dark:bg-blue-950/10'

  const btn = ACTION_BUTTONS[action.action_type] ?? { label: 'Action', icon: AlertCircle, variant: 'outline' as const }
  const BtnIcon = btn.icon

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', severityColor)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{action.member_name}</span>
          {action.severity === 'critical' && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600">URGENT</span>
          )}
        </div>
        <p className="mt-0.5 text-ds-caption">{action.issue}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">{action.detail}</p>
      </div>
      <Button size="sm" variant={btn.variant} className="shrink-0 h-8 px-3 text-xs gap-1.5">
        <BtnIcon className="size-3.5" />
        {btn.label}
      </Button>
    </div>
  )
}

export function LeaderActionCenter() {
  const { data, isPending, isError, refetch } = useLeaderCommandCenter()

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertCircle className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Could not load command center.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (data.team_size === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Users className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-foreground">No team assigned yet</p>
          <p className="text-xs text-muted-foreground mt-1">Team members will appear here once assigned.</p>
        </CardContent>
      </Card>
    )
  }

  const f = data.fires
  const h = data.team_health
  const totalCritical = data.actions.filter(a => a.severity === 'critical').length

  return (
    <div className="space-y-5">
      {/* ── TEAM KPI DASHBOARD ──────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-ds-label font-bold">Team Overview</h2>
          <Badge variant="outline" className="text-[10px] ml-auto">{data.team_size} members</Badge>
          <Badge className={cn('text-[10px]',
            h.leader_band === 'elite' ? 'bg-green-100 text-green-800' :
            h.leader_band === 'average' ? 'bg-amber-100 text-amber-800' :
            'bg-red-100 text-red-800'
          )}>
            Score {h.leader_score} — {h.leader_band}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Mission Completion" value={`${Math.round(h.mission_completion_pct)}%`} icon={<ListChecks className="size-4" />}
            variant={h.mission_completion_pct >= 70 ? 'success' : h.mission_completion_pct >= 40 ? 'warning' : 'danger'} />
          <KpiCard label="Verification" value={`${Math.round(h.verification_pct)}%`} icon={<CheckCircle2 className="size-4" />}
            variant={h.verification_pct >= 70 ? 'success' : h.verification_pct >= 40 ? 'warning' : 'danger'} />
          <KpiCard label="Zombie Leads" value={f.zombie_leads} icon={<Skull className="size-4" />}
            variant={f.zombie_leads > 10 ? 'danger' : f.zombie_leads > 3 ? 'warning' : 'success'} />
          <KpiCard label="At Risk Members" value={f.members_at_risk} icon={<AlertCircle className="size-4" />}
            variant={f.members_at_risk > 5 ? 'danger' : f.members_at_risk > 0 ? 'warning' : 'success'} />
          <KpiCard label="Pending Verifications" value={f.pending_verifications} icon={<Clock className="size-4" />}
            variant={f.pending_verifications > 5 ? 'warning' : f.pending_verifications > 0 ? 'info' : 'success'} />
          <KpiCard label="Campaigns Running" value={f.campaigns_running} icon={<GraduationCap className="size-4" />}
            variant={f.campaigns_running > 0 ? 'info' : 'success'} />
        </div>
      </div>

      {/* ── TEAM HEALTH BARS ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Team Health Breakdown</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <HealthBar label="Mission Completion" value={h.mission_completion_pct} />
          <HealthBar label="Verification Rate" value={h.verification_pct} />
          <HealthBar label="Conversion Rate" value={h.conversion_pct} />
          <HealthBar label="Zombie Score (inverted)" value={h.zombie_score} />
          <HealthBar label="Blocker Resolution" value={h.blocker_resolution_pct} />
          {f.blockers_waiting > 0 && (
            <p className="text-[11px] text-muted-foreground pt-1">
              {f.blockers_waiting} blocker(s) currently unresolved.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── ACTION QUEUE ──────────────────────────────────────────── */}
      {data.actions.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-ds-label font-bold">
              <AlertTriangle className="size-4 text-amber-500" />
              Action Queue
            </h2>
            <Badge variant="secondary" className="text-[10px]">{data.actions.length} items</Badge>
            {totalCritical > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-600">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                </span>
                {totalCritical} urgent
              </span>
            )}
          </div>
          <div className="space-y-2">
            {data.actions.map((a, i) => (
              <ActionCard key={`${a.member_id}-${i}`} action={a} />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-green-500" />
            <p className="mt-3 text-base font-bold text-foreground">All Clear!</p>
            <p className="mt-1 text-sm text-muted-foreground">No actions needed for your team right now.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
