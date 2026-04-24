import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGateAssistantQuery } from '@/hooks/use-gate-assistant-query'
import { cn } from '@/lib/utils'

type Props = {
  sessionReady: boolean
}

function riskStyles(level: 'green' | 'yellow' | 'red') {
  switch (level) {
    case 'red':
      return 'border-l-destructive bg-destructive/[0.06]'
    case 'yellow':
      return 'border-l-warning bg-warning/[0.06]'
    default:
      return 'border-l-success bg-success/[0.05]'
  }
}

function riskLabel(level: 'green' | 'yellow' | 'red') {
  switch (level) {
    case 'red':
      return 'Needs attention'
    case 'yellow':
      return 'In progress'
    default:
      return 'On track'
  }
}

function formatShortDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function GateAssistantCard({ sessionReady }: Props) {
  const { data, isPending, isError, error, refetch } = useGateAssistantQuery(sessionReady)

  if (!sessionReady) {
    return null
  }

  if (isPending) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full max-w-md" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-ds-h3">Gate Assistant</CardTitle>
          <CardDescription className="text-destructive" role="alert">
            {error instanceof Error ? error.message : 'Could not load'}{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const pct =
    data.progress_total > 0
      ? Math.round((data.progress_done / data.progress_total) * 100)
      : 0
  const summaryBits = [
    data.fresh_leads_today > 0 ? `Today's leads: ${data.fresh_leads_today}` : null,
    data.call_target > 0
      ? `Fresh calls: ${data.calls_today} / ${data.call_target}`
      : data.calls_today > 0
        ? `Fresh calls: ${data.calls_today}`
        : null,
    data.overdue_follow_ups > 0 || data.role === 'team'
      ? `Overdue follow-ups: ${data.overdue_follow_ups}`
      : null,
    data.pending_proof_count > 0 || data.role !== 'team'
      ? `Proofs waiting: ${data.pending_proof_count}`
      : null,
    data.members_below_call_gate > 0 || data.role === 'leader'
      ? `Members below gate: ${data.members_below_call_gate}`
      : null,
    data.role !== 'team'
      ? `Warnings: ${data.team_warning_count} · Strong: ${data.team_strong_warning_count} · Final: ${data.team_final_warning_count} · Removed: ${data.team_removed_count}`
      : null,
    data.active_pipeline_leads > 0 ? `Pipeline leads: ${data.active_pipeline_leads}` : null,
  ].filter(Boolean) as string[]
  const secondaryGate = data.checklist.find((c) => !c.done && c.href && c.href !== data.next_href)
  const disciplineDate = formatShortDate(data.grace_end_date)

  return (
    <Card
      className={cn(
        'overflow-hidden border border-border/80 border-l-4 shadow-sm',
        riskStyles(data.risk_level),
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-ds-h3">Gate Assistant</CardTitle>
          </div>
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-ds-caption font-semibold',
              data.risk_level === 'red' && 'border-destructive/40 text-destructive',
              data.risk_level === 'yellow' && 'border-warning/50 text-warning',
              data.risk_level === 'green' && 'border-success/40 text-success',
            )}
          >
            {riskLabel(data.risk_level)}
          </span>
        </div>
        <CardDescription>Current targets, discipline status, and next action.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pct < 100 ? (
          <div>
            <div className="mb-1 flex justify-between text-ds-caption text-muted-foreground">
              <span>Checklist</span>
              <span>
                {data.progress_done} / {data.progress_total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        <ul className="space-y-2 text-sm">
          {data.checklist.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              )}
              {c.href && !c.done ? (
                <Link
                  to={`/dashboard/${c.href}`}
                  className={cn(
                    'underline underline-offset-2',
                    c.done ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {c.label}
                </Link>
              ) : (
                <span className={cn(c.done ? 'text-muted-foreground' : 'text-foreground')}>
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ul>

        {data.compliance_title || data.role !== 'team' ? (
          <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm">
            {data.role === 'team' ? (
              <>
                <p className="font-medium text-foreground">
                  {data.compliance_title ?? 'Discipline status'}
                </p>
                <p className="mt-1 text-ds-caption text-muted-foreground">
                  {data.compliance_summary ?? 'No active compliance warning.'}
                </p>
                {(data.calls_short_streak > 0 || data.missing_report_streak > 0 || disciplineDate) ? (
                  <p className="mt-1 text-ds-caption text-muted-foreground">
                    Calls streak: {data.calls_short_streak}d · Report streak: {data.missing_report_streak}d
                    {disciplineDate ? ` · Grace till ${disciplineDate}` : ''}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">Team discipline snapshot</p>
                <p className="mt-1 text-ds-caption text-muted-foreground">
                  Warning {data.team_warning_count} · Strong {data.team_strong_warning_count} · Final {data.team_final_warning_count} · Removed {data.team_removed_count} · Grace {data.team_grace_count}
                </p>
              </>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {data.next_href ? (
            <Button variant="default" size="sm" asChild>
              <Link to={`/dashboard/${data.next_href}`}>{data.next_label ?? 'Open task'}</Link>
            </Button>
          ) : null}
          {secondaryGate?.href ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/${secondaryGate.href}`}>Open another gate</Link>
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{data.next_action}</p>
          {summaryBits.length > 0 ? (
            <p className="mt-1 text-ds-caption text-muted-foreground">{summaryBits.join(' · ')}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
