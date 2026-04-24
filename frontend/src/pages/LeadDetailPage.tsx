import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Headphones, MessageSquareText, NotebookPen, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LEAD_STATUS_OPTIONS, type LeadStatus, useAvailableTransitionsQuery } from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import {
  type LeadBatchSubmission,
  useLeadCallsQuery,
  useLeadDetailQuery,
  useLogCallMutation,
  usePatchLeadDetailMutation,
  useResetStageClockMutation,
} from '@/hooks/use-lead-detail-query'
import { EnrollmentCard } from '@/components/leads/EnrollmentCard'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { LeadNextStepPanel } from '@/components/leads/LeadNextStepPanel'
import { LeadNotesPanel } from '@/components/leads/LeadNotesPanel'
import { useSendEnrollmentVideoMutation } from '@/hooks/use-enroll-query'
import { apiUrl } from '@/lib/api'
import { callStatusSelectOptions } from '@/lib/call-status-options'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import {
  closeExternalShareWindow,
  completeExternalShareWindow,
  reserveExternalShareWindow,
} from '@/lib/external-share-window'
import { leadStatusSelectOptionsForLead, teamLeadStatusSelectOptions } from '@/lib/team-lead-status'

type Props = {
  leadId: number
}

const CALL_OUTCOME_OPTIONS = [
  { value: 'answered', label: 'Answered' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'callback_requested', label: 'Callback Requested' },
  { value: 'wrong_number', label: 'Wrong Number' },
]

function outcomeLabel(v: string): string {
  return CALL_OUTCOME_OPTIONS.find((o) => o.value === v)?.label ?? v
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    new: 'bg-primary/15 text-primary',
    new_lead: 'bg-primary/15 text-primary',
    contacted: 'bg-sky-400/15 text-sky-400',
    invited: 'bg-violet-400/15 text-violet-400',
    whatsapp_sent: 'bg-pink-400/15 text-pink-400',
    video_sent: 'bg-indigo-400/15 text-indigo-400',
    video_watched: 'bg-blue-400/15 text-blue-400',
    paid: 'bg-amber-400/15 text-amber-400',
    mindset_lock: 'bg-fuchsia-400/15 text-fuchsia-400',
    day1: 'bg-orange-400/15 text-orange-400',
    day2: 'bg-yellow-400/15 text-yellow-400',
    day3: 'bg-lime-400/15 text-lime-400',
    converted: 'bg-[hsl(142_71%_48%)]/15 text-[hsl(142_71%_48%)]',
    lost: 'bg-destructive/15 text-destructive',
  }
  const c = cls[status] ?? 'bg-muted/30 text-muted-foreground'
  const label = LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>
      {label}
    </span>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-amber-400/15 text-amber-400',
    proof_uploaded: 'bg-sky-400/15 text-sky-400',
    approved: 'bg-[hsl(142_71%_48%)]/15 text-[hsl(142_71%_48%)]',
    rejected: 'bg-destructive/15 text-destructive',
  }
  const labels: Record<string, string> = {
    pending: 'Pending',
    proof_uploaded: 'Proof Uploaded',
    approved: 'Approved ✓',
    rejected: 'Rejected',
  }
  const c = cls[status] ?? 'bg-muted/30 text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>
      {labels[status] ?? status}
    </span>
  )
}

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith('http') ? url : apiUrl(url)
}

function batchSubmissionLabel(slot: string): string {
  const match = slot.match(/^d(\d+)_(.+)$/)
  if (!match) return slot.replace(/_/g, ' ')
  return `Day ${match[1]} ${match[2].replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}`
}

function BatchSubmissionCard({ submission }: { submission: LeadBatchSubmission }) {
  const notesUrl = resolveAssetUrl(submission.notes_url)
  const voiceUrl = resolveAssetUrl(submission.voice_note_url)
  const videoUrl = resolveAssetUrl(submission.video_url)

  return (
    <div className="surface-inset space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {batchSubmissionLabel(submission.slot)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-xs text-muted-foreground">
            Day {submission.day_number}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(submission.submitted_at).toLocaleString()}
        </span>
      </div>

      {submission.notes_text ? (
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MessageSquareText className="size-3.5" />
            Lead message
          </div>
          <p className="text-sm leading-relaxed text-foreground">{submission.notes_text}</p>
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <NotebookPen className="size-4" />
            Notes file
          </div>
          {notesUrl ? (
            <a
              href={notesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline"
            >
              Open uploaded notes
            </a>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No notes file uploaded in this submission.</p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Headphones className="size-4" />
            Voice note
          </div>
          {voiceUrl ? (
            <audio controls src={voiceUrl} preload="metadata" className="mt-3 w-full" />
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No voice note uploaded in this submission.</p>
          )}
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Video className="size-4" />
            Practice video
          </div>
          {videoUrl ? (
            <div className="mt-3 space-y-2">
              <video controls src={videoUrl} preload="metadata" className="aspect-video w-full rounded-md bg-black" />
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-primary underline-offset-2 hover:underline"
              >
                Open uploaded video in new tab
              </a>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No practice video uploaded in this submission.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function LeadDetailPage({ leadId }: Props) {
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const { data: lead, isPending, isError, error, refetch } = useLeadDetailQuery(leadId)
  const transitionsQ = useAvailableTransitionsQuery(leadId)
  const callsQuery = useLeadCallsQuery(leadId)
  const patchMut = usePatchLeadDetailMutation()
  const sendEnrollmentMut = useSendEnrollmentVideoMutation()
  const resetStageClockMut = useResetStageClockMutation()
  const logCallMut = useLogCallMutation()
  const pipelineStatusOptions = lead
    ? (() => {
        const base = leadStatusSelectOptionsForLead(surfaceRole ?? null, lead.status as LeadStatus, LEAD_STATUS_OPTIONS)
        const allowed = new Set<LeadStatus>([lead.status as LeadStatus, ...((transitionsQ.data ?? []) as LeadStatus[])])
        const scoped = base.filter((option) => allowed.has(option.value))
        return scoped.length > 0 ? scoped : base
      })()
    : teamLeadStatusSelectOptions(surfaceRole ?? null, LEAD_STATUS_OPTIONS)
  const pipelineCallStatusOptions = lead
    ? callStatusSelectOptions(surfaceRole ?? null, lead.status as LeadStatus)
    : callStatusSelectOptions(surfaceRole ?? null)
  // Pipeline card local state
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [pipelineCallStatus, setPipelineCallStatus] = useState('')
  const [pipelineError, setPipelineError] = useState('')
  const [resetClockError, setResetClockError] = useState('')

  // Notes card
  const [notes, setNotes] = useState('')
  const [notesError, setNotesError] = useState('')
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Log call inline form
  const [showCallForm, setShowCallForm] = useState(false)
  const [callOutcome, setCallOutcome] = useState('answered')
  const [callDuration, setCallDuration] = useState('')
  const [callNotes, setCallNotes] = useState('')
  const [callError, setCallError] = useState('')

  // Clear autosave timer on unmount to prevent memory leaks.
  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current)
    }
  }, [])

  // Keep local editors in sync when `lead` updates (route change or query refetch after save).
  useEffect(() => {
    if (lead) {
      setPipelineStatus(lead.status)
      setPipelineCallStatus(lead.call_status ?? '')
      setNotes(lead.notes ?? '')
    }
  }, [lead])

  async function savePipeline() {
    if (!lead) return
    setPipelineError('')
    const shareWindow = pipelineStatus === 'video_sent' ? reserveExternalShareWindow() : null
    try {
      if (pipelineStatus === 'video_sent') {
        const result = await sendEnrollmentMut.mutateAsync(leadId)
        const manualUrl = result.delivery.manual_share_url?.trim()
        if (!completeExternalShareWindow(shareWindow, manualUrl)) {
          closeExternalShareWindow(shareWindow)
        }
        return
      }
      await patchMut.mutateAsync({
        leadId,
        body: { status: pipelineStatus as LeadStatus, call_status: pipelineCallStatus || undefined },
      })
    } catch (e) {
      closeExternalShareWindow(shareWindow)
      setPipelineError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value)
    setNotesError('')
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      void saveNotes(value)
    }, 1200)
  }

  async function saveNotes(value: string) {
    setNotesError('')
    try {
      await patchMut.mutateAsync({ leadId, body: { notes: value } })
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function handleLogCall(e: FormEvent) {
    e.preventDefault()
    setCallError('')
    const dur = callDuration ? parseInt(callDuration, 10) : undefined
    try {
      await logCallMut.mutateAsync({
        leadId,
        body: {
          outcome: callOutcome,
          duration_seconds: dur,
          notes: callNotes.trim() || undefined,
        },
      })
      setShowCallForm(false)
      setCallOutcome('answered')
      setCallDuration('')
      setCallNotes('')
    } catch (e) {
      setCallError(e instanceof Error ? e.message : 'Could not log call')
    }
  }

  async function toggleDayCompleted(
    field: 'day1_completed_at' | 'day2_completed_at' | 'day3_completed_at',
    current: string | null,
  ) {
    const patchField =
      field === 'day1_completed_at'
        ? 'day1_completed'
        : field === 'day2_completed_at'
          ? 'day2_completed'
          : 'day3_completed'
    try {
      await patchMut.mutateAsync({
        leadId,
        body: { [patchField]: !current },
      })
    } catch {
      /* surfaced by patchMut.isError */
    }
  }

  async function toggleWhatsapp(current: string | null) {
    try {
      await patchMut.mutateAsync({
        leadId,
        body: { whatsapp_sent: !current },
      })
    } catch {
      /* surfaced by patchMut.isError */
    }
  }

  async function handleResetStageClock() {
    if (surfaceRole !== 'admin' || !lead) return
    setResetClockError('')
    const currentStageLabel = LEAD_STATUS_OPTIONS.find((option) => option.value === lead.status)?.label ?? lead.status
    const confirmed = window.confirm(
      lead.status === 'mindset_lock'
        ? 'Reset the Mindset Lock timer for this lead? This keeps the lead in Mindset Lock and restarts the 5-minute countdown.'
        : `Reset the ${currentStageLabel} clock for this lead? This keeps the lead in ${currentStageLabel} and restarts that stage timer.`,
    )
    if (!confirmed) return
    try {
      await resetStageClockMut.mutateAsync({ leadId })
    } catch (e) {
      setResetClockError(e instanceof Error ? e.message : 'Could not reset stage clock')
    }
  }

  if (isPending) {
    return (
      <div className="max-w-4xl space-y-4 p-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="max-w-4xl space-y-4 p-4">
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load lead'}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="max-w-4xl p-4">
        <p className="text-sm text-muted-foreground">Lead not found.</p>
      </div>
    )
  }

  const currentStageLabel = LEAD_STATUS_OPTIONS.find((option) => option.value === lead.status)?.label ?? lead.status
  const stageClockHelpText =
    lead.status === 'mindset_lock'
      ? 'Admin-only: restart the 5-minute Mindset Lock timer without moving this lead out of Mindset Lock.'
      : `Admin-only: restart the ${currentStageLabel} stage clock without moving this lead out of ${currentStageLabel}.`
  const stageClockButtonLabel =
    lead.status === 'mindset_lock' ? 'Reset Mindset Lock Clock' : `Reset ${currentStageLabel} Clock`

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/dashboard/work/leads"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ← All leads
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{lead.name}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Contact card */}
          <div className="surface-elevated p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</p>
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-14 shrink-0">Phone</span>
                {lead.phone ? (
                  <>
                    <span className="min-w-0 text-foreground">{lead.phone}</span>
                    <LeadContactActions phone={lead.phone} className="shrink-0" />
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => void navigator.clipboard.writeText(lead.phone ?? '')}
                    >
                      Copy
                    </button>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-14 shrink-0">Email</span>
                {lead.email ? (
                  <span className="text-foreground break-all">{lead.email}</span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-14 shrink-0">City</span>
                <span className="text-foreground">{lead.city ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-14 shrink-0">Source</span>
                <span className="text-foreground">{lead.source ?? '—'}</span>
              </div>
            </div>
          </div>

          <LeadNextStepPanel
            className="surface-elevated p-4"
            lead={{
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              status: lead.status,
              paymentStatus: lead.payment_status,
            }}
          />

          {/* Pipeline card */}
          <div className="surface-elevated p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pipeline (full control)</p>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="pipeline-status"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </label>
                <select
                  id="pipeline-status"
                  value={pipelineStatus}
                  onChange={(e) => setPipelineStatus(e.target.value)}
                  className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  {pipelineStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="pipeline-call-status"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Call status
                </label>
                <select
                  id="pipeline-call-status"
                  value={pipelineCallStatus}
                  onChange={(e) => setPipelineCallStatus(e.target.value)}
                  className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  <option value="">None</option>
                  {pipelineCallStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={patchMut.isPending}
                onClick={() => void savePipeline()}
              >
                {patchMut.isPending ? 'Saving…' : 'Save pipeline'}
              </Button>
              {pipelineError ? (
                <p className="text-xs text-destructive" role="alert">
                  {pipelineError}
                </p>
              ) : null}
              {surfaceRole === 'admin' ? (
                <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Stage Clock Control</p>
                      <p className="text-xs text-muted-foreground">{stageClockHelpText}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={resetStageClockMut.isPending}
                      onClick={() => void handleResetStageClock()}
                    >
                      {resetStageClockMut.isPending ? 'Resetting…' : stageClockButtonLabel}
                    </Button>
                  </div>
                  {resetClockError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {resetClockError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Timeline card */}
          <div className="surface-elevated p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline</p>
            <div className="space-y-2">
              {(
                [
                  ['day1_completed_at', 'Day 1 completed'],
                  ['day2_completed_at', 'Day 2 completed'],
                  ['day3_completed_at', 'Day 3 completed'],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!lead[field]}
                    disabled={patchMut.isPending}
                    onChange={() => void toggleDayCompleted(field, lead[field])}
                    className="h-4 w-4 rounded border-white/12 bg-white/[0.05] accent-primary"
                  />
                  <span className="text-foreground">{label}</span>
                  {lead[field] ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(lead[field]!).toLocaleDateString()}
                    </span>
                  ) : null}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!lead.whatsapp_sent_at}
                  disabled={patchMut.isPending}
                  onChange={() => void toggleWhatsapp(lead.whatsapp_sent_at)}
                  className="h-4 w-4 rounded border-white/12 bg-white/[0.05] accent-primary"
                />
                <span className="text-foreground">WhatsApp sent</span>
                {lead.whatsapp_sent_at ? (
                  <span className="text-xs text-muted-foreground">
                    {new Date(lead.whatsapp_sent_at).toLocaleDateString()}
                  </span>
                ) : null}
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* Call log card */}
          <div className="surface-elevated p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Call log
                {lead.call_count > 0 ? (
                  <span className="ml-1.5 normal-case">({lead.call_count})</span>
                ) : null}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowCallForm((v) => !v)}
              >
                {showCallForm ? 'Cancel' : '+ Log call'}
              </Button>
            </div>

            {showCallForm ? (
              <form onSubmit={(e) => void handleLogCall(e)} className="surface-inset space-y-3 p-3">
                <div>
                  <label
                    htmlFor="call-outcome"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Outcome
                  </label>
                  <select
                    id="call-outcome"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                  >
                    {CALL_OUTCOME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="call-duration"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Duration (seconds, optional)
                  </label>
                  <input
                    id="call-duration"
                    type="number"
                    min="0"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                    placeholder="e.g. 120"
                  />
                </div>
                <div>
                  <label
                    htmlFor="call-notes"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id="call-notes"
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 resize-none"
                    placeholder="What was discussed…"
                  />
                </div>
                {callError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {callError}
                  </p>
                ) : null}
                <Button type="submit" size="sm" disabled={logCallMut.isPending}>
                  {logCallMut.isPending ? 'Logging…' : 'Log call'}
                </Button>
              </form>
            ) : null}

            {callsQuery.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}

            {callsQuery.data && callsQuery.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No calls logged yet.</p>
            ) : null}

            {callsQuery.data && callsQuery.data.items.length > 0 ? (
              <ul className="space-y-2">
                {callsQuery.data.items.map((c) => (
                  <li key={c.id} className="surface-inset px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-medium text-foreground">{outcomeLabel(c.outcome)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.called_at).toLocaleString()}
                      </span>
                    </div>
                    {c.duration_seconds != null ? (
                      <p className="text-xs text-muted-foreground">{c.duration_seconds}s</p>
                    ) : null}
                    {c.notes ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Notes card */}
          <div className="surface-elevated p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 resize-none"
              placeholder="Add notes about this lead…"
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                disabled={patchMut.isPending}
               
                onClick={() => void saveNotes(notes)}
              >
                {patchMut.isPending ? 'Saving…' : 'Save notes'}
              </Button>
              {notesError ? (
                <p className="text-xs text-destructive" role="alert">
                  {notesError}
                </p>
              ) : null}
            </div>
          </div>

          {/* Lead Notes */}
          <LeadNotesPanel leadId={leadId} />

          {/* Enrollment card */}
          <EnrollmentCard leadId={leadId} />

          <div className="surface-elevated p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch submissions</p>
              <span className="text-xs text-muted-foreground">Day 2 review wall</span>
            </div>
            {lead.batch_submissions.length > 0 ? (
              <div className="space-y-3">
                {lead.batch_submissions.map((submission) => (
                  <BatchSubmissionCard key={submission.id} submission={submission} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Lead ne abhi Day 2 notes, voice note, video, ya message submit nahi kiya. Jaise hi batch room se submission aayegi, admin yahi dekh paayega.
              </p>
            )}
          </div>

          {/* Payment card */}
          <div className="surface-elevated p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Status</span>
                {lead.payment_status ? (
                  <PaymentStatusBadge status={lead.payment_status} />
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Amount</span>
                {lead.payment_amount_cents != null ? (
                  <span className="text-foreground">
                    ₹{(lead.payment_amount_cents / 100).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Proof</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {lead.payment_proof_url ? (
                    <a
                      href={lead.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-primary underline-offset-2 hover:underline text-xs break-all"
                    >
                      View proof
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {surfaceRole === 'team' ? (
                        <>
                          ₹196 proof upload sirf{' '}
                          <Link
                            to="/dashboard/work/leads"
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Calling Board
                          </Link>{' '}
                          me hota hai.
                        </>
                      ) : surfaceRole === 'leader' ? (
                        <>
                          ₹196 proof upload sirf{' '}
                          <Link
                            to="/dashboard/work/leads"
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Calling Board
                          </Link>{' '}
                          me hota hai.
                        </>
                      ) : (
                        <>
                          ₹196 proof leader ya team work/leads flow se upload karte hain; admin yahan se sirf status dekh
                          ya{' '}
                          <Link
                            to="/dashboard/team/enrollment-approvals"
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            approvals
                          </Link>{' '}
                          review karta hai.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
