import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, Clock3, ShieldCheck, UserCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import {
  useLeadControlBulkReassignMutation,
  useLeadControlManualReassignMutation,
  useLeadControlQuery,
} from '@/hooks/use-lead-control-query'
import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'

type Props = {
  title: string
}

function statusLabel(status: string): string {
  return LEAD_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status.replace(/_/g, ' ')
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatHoursAgo(value: string | null | undefined): string {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const hours = Math.max(0, Math.round(diffMs / 3_600_000))
  return `${hours}h ago`
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint: string
}) {
  return (
    <Card className="surface-elevated border-border/60">
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <p className="font-heading text-3xl text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function LeadControlPage({ title }: Props) {
  const query = useLeadControlQuery()
  const manualReassign = useLeadControlManualReassignMutation()
  const bulkReassign = useLeadControlBulkReassignMutation()
  const queue = query.data?.queue ?? []
  const assignableUsers = query.data?.assignable_users ?? []
  const historySummary = query.data?.history_summary ?? []
  const history = query.data?.history ?? []

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedLeadId(null)
      return
    }
    if (!queue.some((lead) => lead.lead_id === selectedLeadId)) {
      setSelectedLeadId(queue[0].lead_id)
    }
  }, [queue, selectedLeadId])

  useEffect(() => {
    const queueIds = new Set(queue.map((lead) => lead.lead_id))
    setSelectedLeadIds((current) => current.filter((leadId) => queueIds.has(leadId)))
  }, [queue])

  const selectedLead = useMemo(
    () => queue.find((lead) => lead.lead_id === selectedLeadId) ?? null,
    [queue, selectedLeadId],
  )

  const selectedBulkLeads = useMemo(
    () => queue.filter((lead) => selectedLeadIds.includes(lead.lead_id)),
    [queue, selectedLeadIds],
  )

  const bulkMode = selectedBulkLeads.length > 0

  const targetOptions = useMemo(() => {
    if (bulkMode) {
      const excludedAssigneeIds = new Set(
        selectedBulkLeads
          .map((lead) => lead.assigned_to_user_id)
          .filter((userId): userId is number => userId != null),
      )
      return assignableUsers.filter((user) => !excludedAssigneeIds.has(user.user_id))
    }
    if (!selectedLead) return []
    return assignableUsers.filter((user) => user.user_id !== selectedLead.assigned_to_user_id)
  }, [assignableUsers, bulkMode, selectedBulkLeads, selectedLead])

  useEffect(() => {
    if (targetOptions.length === 0) {
      setSelectedUserId('')
      return
    }
    if (!targetOptions.some((user) => String(user.user_id) === selectedUserId)) {
      setSelectedUserId(String(targetOptions[0].user_id))
    }
  }, [selectedUserId, targetOptions])

  async function handleManualReassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedLead) {
      setSubmitError('Choose a queued lead first.')
      return
    }
    if (!selectedUserId) {
      setSubmitError('Choose a member to receive this lead.')
      return
    }
    setSubmitError('')
    setSubmitMessage('')
    try {
      const result = await manualReassign.mutateAsync({
        leadId: selectedLead.lead_id,
        toUserId: Number(selectedUserId),
        reason: reason.trim() || undefined,
      })
      setReason('')
      setSubmitMessage(result.message)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not reassign this lead right now.')
    }
  }

  function toggleLeadSelection(leadId: number, checked: boolean) {
    setSelectedLeadIds((current) => {
      if (checked) {
        return current.includes(leadId) ? current : [...current, leadId]
      }
      return current.filter((id) => id !== leadId)
    })
    setSubmitError('')
    setSubmitMessage('')
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedLeadIds(checked ? queue.map((lead) => lead.lead_id) : [])
    setSubmitError('')
    setSubmitMessage('')
  }

  async function handleBulkReassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedBulkLeads.length === 0) {
      setSubmitError('Choose at least one stale queued lead first.')
      return
    }
    if (!selectedUserId) {
      setSubmitError('Choose a member to receive these leads.')
      return
    }
    setSubmitError('')
    setSubmitMessage('')
    try {
      const result = await bulkReassign.mutateAsync({
        leadIds: selectedBulkLeads.map((lead) => lead.lead_id),
        toUserId: Number(selectedUserId),
        reason: reason.trim() || undefined,
      })
      setReason('')
      setSelectedLeadIds([])
      setSubmitMessage(result.message)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not bulk reassign these leads right now.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-4xl space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only control for archived completed-watch reassignment, manual redistribution, and soft audit history.
        </p>
      </div>

      {query.isPending ? (
        <Card className="surface-elevated">
          <CardContent className="p-6">
            <LoadingState label="Loading lead control..." />
          </CardContent>
        </Card>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="Could not load lead control"
          message={query.error instanceof Error ? query.error.message : 'Please try again.'}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          <Card className="surface-elevated border-primary/15 bg-primary/5">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  Owner stays protected
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {query.data.note}
                </p>
                <p className="text-xs text-muted-foreground">
                  Day 2 uploads now live in{' '}
                  <Link to="/dashboard/system/day2-review" className="text-primary underline-offset-2 hover:underline">
                    Day 2 Review
                  </Link>
                  , so reassignment controls stay focused here.
                </p>
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Admin only
              </span>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Ready Now"
              value={query.data.queue_total}
              hint="Archived completed-watch leads waiting for reassignment."
            />
            <StatCard
              label="Manual Targets"
              value={assignableUsers.length}
              hint="Approved active leader/team members available for reassignment."
            />
            <StatCard
              label="Soft Log"
              value={query.data.history_total}
              hint="Recent auto + manual reassignment records stored for admin review."
            />
            <StatCard
              label="Workers Used"
              value={historySummary.length}
              hint="Members who have already received reassigned leads in the soft log."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="surface-elevated overflow-hidden border-border/60">
              <CardHeader className="border-b border-border/60 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ArrowRightLeft className="size-4" />
                      Reassignment Queue
                    </CardTitle>
                    <CardDescription>
                      Leads leave this list as soon as admin manually reassigns them or the auto cycle moves them.
                    </CardDescription>
                  </div>
                  {queue.length > 0 ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.length === queue.length}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                        className="size-4 rounded border-white/[0.16] bg-background accent-primary"
                      />
                      Select all stale leads
                    </label>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {queue.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="No leads waiting right now"
                      description="Archived completed-watch leads will appear here once they become eligible for reassignment."
                    />
                  </div>
                ) : (
                  <div className="max-h-[34rem] divide-y divide-white/[0.08] overflow-y-auto">
                    {queue.map((lead) => {
                      const active = lead.lead_id === selectedLeadId
                      return (
                        <button
                          key={lead.lead_id}
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.lead_id)
                            setSubmitError('')
                            setSubmitMessage('')
                          }}
                          className={`w-full px-5 py-4 text-left transition ${
                            active ? 'bg-primary/10' : 'hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.includes(lead.lead_id)}
                                onChange={(event) => {
                                  event.stopPropagation()
                                  toggleLeadSelection(lead.lead_id, event.target.checked)
                                }}
                                onClick={(event) => event.stopPropagation()}
                                className="mt-1 size-4 rounded border-white/[0.16] bg-background accent-primary"
                                aria-label={`Select ${lead.lead_name}`}
                              />
                              <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">{lead.lead_name}</p>
                                <span className="rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {statusLabel(lead.status)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Current assignee: <span className="text-foreground">{lead.assigned_to_name}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Owner: <span className="text-foreground">{lead.owner_name}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {lead.phone || 'No phone on file'}
                              </p>
                            </div>
                            </div>
                            <div className="space-y-1 text-right text-xs text-muted-foreground">
                              <p>Archived {formatHoursAgo(lead.archived_at)}</p>
                              <p>Watch done {formatDateTime(lead.watch_completed_at)}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="surface-elevated border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCheck className="size-4" />
                  {bulkMode ? 'Bulk Reassignment' : 'Manual Reassignment'}
                </CardTitle>
                <CardDescription>
                  Owner remains unchanged. Only the current working assignee moves, and only stale archived watch leads can leave this queue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bulkMode || selectedLead ? (
                  <form className="space-y-4" onSubmit={(event) => void (bulkMode ? handleBulkReassign(event) : handleManualReassign(event))}>
                    {bulkMode ? (
                      <div className="surface-inset space-y-3 rounded-xl p-4">
                        <div>
                          <p className="font-medium text-foreground">{selectedBulkLeads.length} stale leads selected</p>
                          <p className="text-xs text-muted-foreground">
                            Bulk assign works only on this stale archived queue. Active leads are blocked in the API as well.
                          </p>
                        </div>
                        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                          {selectedBulkLeads.map((lead) => (
                            <div key={lead.lead_id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-foreground">{lead.lead_name}</p>
                                <span className="text-xs text-muted-foreground">{statusLabel(lead.status)}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {lead.assigned_to_name} · archived {formatDateTime(lead.archived_at)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : selectedLead ? (
                      <div className="surface-inset space-y-2 rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{selectedLead.lead_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {statusLabel(selectedLead.status)} · archived {formatDateTime(selectedLead.archived_at)}
                            </p>
                          </div>
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/dashboard/work/leads/${selectedLead.lead_id}`}>Open lead</Link>
                          </Button>
                        </div>
                        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide">Current assignee</p>
                            <p className="mt-1 text-foreground">{selectedLead.assigned_to_name}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">Owner</p>
                            <p className="mt-1 text-foreground">{selectedLead.owner_name}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">Watch completed</p>
                            <p className="mt-1 text-foreground">{formatDateTime(selectedLead.watch_completed_at)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide">Phone</p>
                            <p className="mt-1 text-foreground">{selectedLead.phone || 'No phone on file'}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <label className="block space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {bulkMode ? 'Move selected leads to' : 'Move lead to'}
                      </span>
                      <select
                        value={selectedUserId}
                        onChange={(event) => setSelectedUserId(event.target.value)}
                        className="h-12 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground outline-none ring-0 transition focus:border-primary/40"
                      >
                        {targetOptions.map((user) => (
                          <option key={user.user_id} value={user.user_id}>
                            {user.display_name} · {user.role} · {user.active_leads_count} active
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Soft note for admin log
                      </span>
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={4}
                        maxLength={500}
                        placeholder="Why are you manually moving this lead?"
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-3 text-sm text-foreground outline-none ring-0 transition focus:border-primary/40"
                      />
                    </label>

                    {submitMessage ? (
                      <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                        {submitMessage}
                      </p>
                    ) : null}
                    {submitError ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {submitError}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={manualReassign.isPending || bulkReassign.isPending || targetOptions.length === 0}
                    >
                      {bulkMode
                        ? bulkReassign.isPending
                          ? 'Reassigning leads...'
                          : `Reassign ${selectedBulkLeads.length} lead${selectedBulkLeads.length === 1 ? '' : 's'}`
                        : manualReassign.isPending
                          ? 'Reassigning...'
                          : 'Reassign lead'}
                    </Button>
                  </form>
                ) : (
                  <EmptyState
                    title="Choose a queued lead"
                    description="Pick one lead from the left, or tick multiple stale leads to bulk move them to another approved member."
                  />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="surface-elevated border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="size-4" />
                  Reassignment Summary
                </CardTitle>
                <CardDescription>Who has received the most reassigned leads so far.</CardDescription>
              </CardHeader>
              <CardContent>
                {historySummary.length === 0 ? (
                  <EmptyState
                    title="No reassignment history yet"
                    description="Auto and manual logs will start appearing here as soon as leads move."
                  />
                ) : (
                  <div className="space-y-3">
                    {historySummary.map((row) => (
                      <div
                        key={row.user_id}
                        className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">{row.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.role} · last received {formatDateTime(row.last_received_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
                            Total {row.total_received}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                            Auto {row.auto_received}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                            Manual {row.manual_received}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="surface-elevated border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock3 className="size-4" />
                  Recent Reassignment Log
                </CardTitle>
                <CardDescription>Soft audit trail for recent auto and manual lead movement.</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <EmptyState
                    title="No recent movement"
                    description="Once auto or manual reassignment runs, the latest rows will appear here."
                  />
                ) : (
                  <div className="space-y-3">
                    {history.map((row) => (
                      <div key={row.activity_id} className="surface-inset rounded-xl p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{row.lead_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Owner {row.owner_name || 'Unknown'} · {formatDateTime(row.occurred_at)}
                            </p>
                          </div>
                          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground">
                            {row.mode === 'manual' ? 'Manual' : 'Auto'}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {row.previous_assignee_name || 'Unassigned'} →{' '}
                          <span className="font-medium text-foreground">{row.assigned_to_name || 'Unassigned'}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Actor: {row.actor_name}
                          {row.reason ? ` · ${row.reason}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  )
}
