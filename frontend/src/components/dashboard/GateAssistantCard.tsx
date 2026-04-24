import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useGateAssistantQuery } from '@/hooks/use-gate-assistant-query'
import {
  useCancelMyGraceRequestMutation,
  useRequestMyGraceMutation,
} from '@/hooks/use-team-query'
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
  const { isAdminPreviewing } = useDashboardShellRole()
  const { data, isPending, isError, error, refetch } = useGateAssistantQuery(sessionReady)
  const requestGraceMut = useRequestMyGraceMutation()
  const cancelGraceRequestMut = useCancelMyGraceRequestMutation()
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestEndDate, setRequestEndDate] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setRequestEndDate(data.grace_request_end_date?.slice(0, 10) ?? '')
    setRequestReason(data.grace_request_reason ?? '')
  }, [data?.grace_request_end_date, data?.grace_request_reason, data])

  if (!sessionReady) {
    return null
  }

  if (isAdminPreviewing) {
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
  const reportGate = data.checklist.find((c) => c.id === 'daily_report_submitted')
  const summaryBits =
    data.role === 'admin'
      ? [
          data.pending_proof_count > 0 ? `Proofs waiting: ${data.pending_proof_count}` : null,
          data.team_warning_count > 0 ||
          data.team_strong_warning_count > 0 ||
          data.team_final_warning_count > 0 ||
          data.team_removed_count > 0
            ? `Warnings: ${data.team_warning_count} · Strong: ${data.team_strong_warning_count} · Final: ${data.team_final_warning_count} · Removed: ${data.team_removed_count}`
            : null,
        ].filter(Boolean) as string[]
      : [
          data.fresh_leads_today > 0 ? `Today's leads: ${data.fresh_leads_today}` : 'No fresh lead gate yet today',
          data.call_target > 0
            ? `Fresh calls: ${data.calls_today} / ${data.call_target}`
            : `Fresh calls: ${data.calls_today}`,
          `Report: ${reportGate?.done ? 'submitted' : 'pending'}`,
        ]
  const disciplineDate = formatShortDate(data.grace_end_date)
  const requestDate = formatShortDate(data.grace_request_end_date)
  const requestBusy = requestGraceMut.isPending || cancelGraceRequestMut.isPending

  function handleGraceRequestSubmit() {
    if (!requestEndDate.trim()) {
      setRequestError('Grace till date required.')
      return
    }
    setRequestError(null)
    requestGraceMut.mutate(
      {
        graceEndDate: requestEndDate,
        reason: requestReason.trim() || null,
      },
      {
        onSuccess: () => {
          setRequestOpen(false)
        },
        onError: (e: Error) => setRequestError(e.message),
      },
    )
  }

  function handleCancelRequest() {
    setRequestError(null)
    cancelGraceRequestMut.mutate(undefined, {
      onSuccess: () => {
        setRequestOpen(false)
        setRequestEndDate('')
        setRequestReason('')
      },
      onError: (e: Error) => setRequestError(e.message),
    })
  }

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
        <CardDescription>
          {data.role === 'admin'
            ? 'Org discipline overview.'
            : "Only 2 active gates: 15 fresh calls and today's daily report."}
        </CardDescription>
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

        {data.role !== 'admin' &&
        (data.compliance_title ||
          data.calls_short_streak > 0 ||
          data.missing_report_streak > 0 ||
          disciplineDate) ? (
          <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">
              {data.compliance_title ?? 'Discipline status'}
            </p>
            <p className="mt-1 text-ds-caption text-muted-foreground">
              {data.compliance_summary ?? 'No active compliance warning.'}
            </p>
            {data.calls_short_streak > 0 || data.missing_report_streak > 0 || disciplineDate ? (
              <p className="mt-1 text-ds-caption text-muted-foreground">
                Calls streak: {data.calls_short_streak}d · Report streak: {data.missing_report_streak}d
                {disciplineDate ? ` · Grace till ${disciplineDate}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {data.role !== 'admin' ? (
          <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">
                  {data.grace_request_pending ? 'Grace request pending' : 'Grace request'}
                </p>
                <p className="mt-1 text-ds-caption text-muted-foreground">
                  {data.grace_request_pending
                    ? `Requested till ${requestDate ?? data.grace_request_end_date ?? '—'}`
                    : 'Raise leave / grace from here. Admin will review it from All Members.'}
                </p>
                {data.grace_request_reason ? (
                  <p className="mt-1 text-ds-caption text-muted-foreground">{data.grace_request_reason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={requestBusy}
                  onClick={() => {
                    setRequestError(null)
                    setRequestOpen((value) => !value)
                  }}
                >
                  {data.grace_request_pending
                    ? 'Update request'
                    : data.grace_active
                      ? 'Request extension'
                      : 'Request grace'}
                </Button>
                {data.grace_request_pending ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={requestBusy}
                    onClick={handleCancelRequest}
                  >
                    Cancel request
                  </Button>
                ) : null}
              </div>
            </div>
            {requestOpen ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-ds-caption text-muted-foreground">Grace till</span>
                  <input
                    type="date"
                    value={requestEndDate}
                    onChange={(e) => setRequestEndDate(e.target.value)}
                    disabled={requestBusy}
                    className="field-input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-ds-caption text-muted-foreground">Reason / note</span>
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    disabled={requestBusy}
                    rows={3}
                    className="field-input min-h-[5rem] resize-y"
                    placeholder="Optional reason for leave / grace"
                  />
                </label>
                {requestError ? (
                  <p className="text-ds-caption text-destructive" role="alert">
                    {requestError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={requestBusy || !requestEndDate.trim()}
                    onClick={handleGraceRequestSubmit}
                  >
                    {requestGraceMut.isPending
                      ? '...'
                      : data.grace_request_pending
                        ? 'Update request'
                        : 'Send request'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={requestBusy}
                    onClick={() => {
                      setRequestOpen(false)
                      setRequestError(null)
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {data.next_href ? (
            <Button variant="default" size="sm" asChild>
              <Link to={`/dashboard/${data.next_href}`}>{data.next_label ?? 'Open task'}</Link>
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
