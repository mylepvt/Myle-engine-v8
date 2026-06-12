import { AlertTriangle, CheckCircle2, Cog, Play, RefreshCw, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAutomationRules, useAutomationLogs, useEvaluateAutomation, useToggleAutomationRule } from '@/hooks/use-automation-query'
import { cn } from '@/lib/utils'

const TRIGGER_LABELS: Record<string, string> = {
  missed_missions: 'Missed Missions',
  zombie_lead: 'Zombie Lead',
  verification_sla: 'Verification SLA',
  campaign_incomplete: 'Campaign Incomplete',
  inactivity: 'Inactivity',
  risk_threshold: 'Risk Threshold',
}

const ACTION_LABELS: Record<string, string> = {
  alert_leader: 'Alert Leader',
  create_task: 'Create Task',
  escalate: 'Escalate',
}

export function AutomationPanel({ className }: { className?: string }) {
  const rules = useAutomationRules()
  const logs = useAutomationLogs(20)
  const evaluate = useEvaluateAutomation()
  const toggleRule = useToggleAutomationRule()

  return (
    <div className={cn('space-y-5', className)}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cog className="size-5 text-primary" />
          <h2 className="text-ds-label font-bold">Automation Engine</h2>
          <Badge variant="secondary" className="text-[10px]">
            {rules.data ? `${rules.data.filter(r => r.is_active).length} active / ${rules.data.length} total` : '...'}
          </Badge>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => evaluate.mutate()}
          disabled={evaluate.isPending}
        >
          {evaluate.isPending ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {evaluate.isPending ? 'Evaluating...' : 'Run All Rules'}
        </Button>
      </div>

      {evaluate.data && (
        <div className="rounded-lg border border-green-200 bg-green-50/60 dark:bg-green-950/10 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green-600" />
            <p className="text-xs font-semibold text-green-800 dark:text-green-300">
              Evaluation complete — {evaluate.data.triggered} action(s) triggered
            </p>
          </div>
        </div>
      )}

      {/* ── RULES LIST ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cog className="size-4 text-primary" />
            Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.isPending ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : rules.isError ? (
            <p className="text-sm text-muted-foreground">Failed to load rules.</p>
          ) : (rules.data ?? []).length === 0 ? (
            <div className="py-6 text-center">
              <Cog className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-semibold text-foreground">No automation rules</p>
              <p className="text-xs text-muted-foreground mt-1">Rules will be seeded automatically on migration.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {rules.data!.map(rule => (
                <div
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition',
                    rule.is_active ? 'border-border/60' : 'border-border/30 opacity-60',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{rule.name}</span>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {rule.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-ds-caption">
                      {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type} → {ACTION_LABELS[rule.action_type] ?? rule.action_type}
                      {rule.cooldown_hours > 0 && ` · ${rule.cooldown_hours}h cooldown`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={rule.is_active ? 'outline' : 'secondary'}
                    className="h-7 text-[10px] px-2"
                    onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                    disabled={toggleRule.isPending}
                  >
                    {rule.is_active ? 'Pause' : 'Activate'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ACTION LOG ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-primary" />
              Action Log
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">{logs.data?.length ?? 0} recent</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {logs.isPending ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (logs.data ?? []).length === 0 ? (
            <div className="py-6 text-center">
              <AlertTriangle className="mx-auto size-6 text-muted-foreground/40" />
              <p className="mt-1 text-xs text-muted-foreground">No actions triggered yet. Run rules to see results.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.data!.map(log => (
                <div key={log.id} className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3 py-2">
                  <div className="mt-0.5">
                    {log.action_type === 'escalate' ? (
                      <AlertTriangle className="size-3.5 text-red-500" />
                    ) : (
                      <CheckCircle2 className="size-3.5 text-green-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {TRIGGER_LABELS[log.trigger_type] ?? log.trigger_type} → {ACTION_LABELS[log.action_type] ?? log.action_type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {log.trigger_entity_type} #{log.trigger_entity_id} · {new Date(log.created_at).toLocaleString('en-IN')}
                    </p>
                    {log.action_result && (
                      <p className="text-[10px] text-muted-foreground/70 truncate">
                        {JSON.stringify(log.action_result).slice(0, 120)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
