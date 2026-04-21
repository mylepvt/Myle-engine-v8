import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CheckSquare, Eye, Pencil, Search, Send, Upload, Video } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  fetchMindsetLockPreview,
  LEAD_STATUS_OPTIONS,
  postMindsetLockComplete,
  type LeadPublic,
  type LeadStatus,
  type MindsetLockPreviewResponse,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { apiFetch } from '@/lib/api'
import { callStatusSelectOptions } from '@/lib/call-status-options'
import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'
import { getMindsetLockSendState } from '@/lib/mindset-lock'
import { LEAD_SLA_SMOOTH_REFRESH_MS, formatLeadSlaTime, leadSlaClockAngles, leadSlaTone } from '@/lib/lead-sla'
import { whatsappDigits } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = { title: string }
type Col = { status: string; total: number; items: LeadPublic[] }

// ── Constants ──────────────────────────────────────────────────────────────────
const BADGE: Record<string, string> = {
  new_lead:       'bg-primary/15 text-primary border-primary/25',
  contacted:      'bg-sky-400/15 text-sky-300 border-sky-400/25',
  invited:        'bg-violet-400/15 text-violet-300 border-violet-400/25',
  whatsapp_sent:  'bg-pink-400/15 text-pink-300 border-pink-400/25',
  video_sent:     'bg-indigo-400/15 text-indigo-300 border-indigo-400/25',
  video_watched:  'bg-blue-400/15 text-blue-300 border-blue-400/25',
  paid:           'bg-amber-400/15 text-amber-300 border-amber-400/25',
  mindset_lock:   'bg-fuchsia-400/15 text-fuchsia-300 border-fuchsia-400/25',
  day1:           'bg-orange-400/15 text-orange-300 border-orange-400/25',
  day2:           'bg-yellow-400/15 text-yellow-300 border-yellow-400/25',
  day3:           'bg-lime-400/15 text-lime-300 border-lime-400/25',
  interview:      'bg-lime-400/15 text-lime-300 border-lime-400/25',
  track_selected: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  seat_hold:      'bg-teal-400/15 text-teal-300 border-teal-400/25',
  converted:      'bg-green-500/15 text-green-300 border-green-500/25',
  lost:           'bg-destructive/15 text-destructive border-destructive/25',
}
const CLOSE:  LeadStatus[] = ['converted','lost']
const MIN_MINDSET_SECONDS = 300
type BatchSlotKey = 'd1_morning' | 'd1_afternoon' | 'd1_evening' | 'd2_morning' | 'd2_afternoon' | 'd2_evening'
type WorkboardStageKey = 'day1' | 'day2' | 'day3' | 'interview' | 'track_selected' | 'seat_hold'
const slabel  = (s: string) => LEAD_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

const ADMIN_STAGE_TABS: {
  id: WorkboardStageKey | 'closing'
  label: string
  statuses: LeadStatus[]
  stageKey?: WorkboardStageKey
  nextStatus?: LeadStatus
  nextLabel?: string
}[] = [
  { id: 'day1', label: 'Day 1', statuses: ['day1'], stageKey: 'day1', nextStatus: 'day2', nextLabel: 'Move to Day 2 →' },
  { id: 'day2', label: 'Day 2', statuses: ['day2'], stageKey: 'day2', nextStatus: 'day3', nextLabel: 'Move to Day 3 →' },
  { id: 'day3', label: 'Day 3', statuses: ['day3'], stageKey: 'day3', nextStatus: 'interview', nextLabel: 'Move to Interview →' },
  { id: 'interview', label: 'Interview', statuses: ['interview'], stageKey: 'interview', nextStatus: 'track_selected', nextLabel: 'Move to Track Selected →' },
  { id: 'track_selected', label: 'Track', statuses: ['track_selected'], stageKey: 'track_selected', nextStatus: 'seat_hold', nextLabel: 'Move to Seat Hold →' },
  { id: 'seat_hold', label: 'Seat Hold', statuses: ['seat_hold'], stageKey: 'seat_hold', nextStatus: 'converted', nextLabel: 'Mark converted →' },
  { id: 'closing', label: 'Closing', statuses: CLOSE },
]

function mmss(totalSeconds: number): string {
  const sec = Math.max(0, totalSeconds)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function day2TestWhatsAppUrl(lead: LeadPublic): string | null {
  const digits = whatsappDigits(lead.phone ?? '')
  if (!digits) return null
  const testPath = '/dashboard/system/training'
  const testUrl = `${window.location.origin}${testPath}`
  const name = (lead.name || 'Participant').trim()
  const msg =
    `Hi ${name}, your Day 2 batches are complete.\n` +
    `Please take the test from this link:\n${testUrl}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

function workboardBatchWhatsAppUrl(
  lead: LeadPublic,
  dayKey: 1 | 2 | 3,
  slot: 'M' | 'A' | 'E',
  links?: { v1?: string; v2?: string },
): string | null {
  const digits = whatsappDigits(lead.phone ?? '')
  if (!digits) return null
  const name = (lead.name || 'Participant').trim()
  const linkBlock =
    (links?.v1 ? `📹 Video 1:\n${links.v1}\n` : '') +
    (links?.v2 ? `📹 Video 2:\n${links.v2}\n` : '')
  const msg =
    `Hi ${name},\n` +
    `Your Day ${dayKey} ${slot} batch is starting now.\n` +
    (linkBlock ? `\n${linkBlock}` : '\n') +
    'Please watch and confirm.'
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

async function readResponseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}))
  if (typeof body === 'object' && body !== null) {
    if ('detail' in body && typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
    const errorMessage = (body as { error?: { message?: string } }).error?.message
    if (typeof errorMessage === 'string' && errorMessage.trim()) {
      return errorMessage
    }
  }
  return res.statusText || `HTTP ${res.status}`
}

// ── Tiny shared primitives ─────────────────────────────────────────────────────
type PM = ReturnType<typeof usePatchLeadMutation>

function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cn('shrink-0 -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition',
            active === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}
          {t.count !== undefined &&
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-ds-caption tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

function IconBtn({ href, onClick, title, colorHover, children }: {
  href?: string; onClick?: () => void; title: string; colorHover: string; children: React.ReactNode
}) {
  const cls = cn('flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30 text-foreground transition', colorHover)
  if (href) return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={title} className={cls}>{children}</a>
  return <button type="button" title={title} onClick={onClick} className={cls}>{children}</button>
}

// ── LeadCard (team / leader / closing tab + day tabs) ─────────────────────────
const LeadCard = memo(function LeadCard({
  lead,
  pm,
  leadPatchBusy,
  mindsetBusy,
  mindsetPreview,
  onRequestMindsetSend,
  stageKey,
  onMoveNext,
  nextLabel,
  nowMs,
}: {
  lead: LeadPublic
  pm: PM
  leadPatchBusy: boolean
  mindsetBusy?: boolean
  mindsetPreview?: MindsetLockPreviewResponse | null
  onRequestMindsetSend?: (lead: LeadPublic) => void
  stageKey?: WorkboardStageKey
  onMoveNext?: () => void
  nextLabel?: string
  nowMs: number
}) {
  const { role } = useDashboardShellRole()
  // ── Proof upload ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const qc = useQueryClient()
  const stageOpsCard = stageKey != null

  const proofApproved = lead.payment_status === 'approved'
  const proofPending = lead.payment_status === 'proof_uploaded' || uploadDone
  const proofRejected = lead.payment_status === 'rejected'
  const showProofControl = !stageOpsCard && (lead.status === 'video_watched' || proofPending || proofApproved || proofRejected)
  const mayUploadProof = lead.status === 'video_watched' || proofRejected

  async function handleProofFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('proof_file', file)
      fd.append('lead_id', String(lead.id))
      fd.append('payment_amount_cents', '19600')
      await apiFetch('/api/v1/payments/proof/upload', { method: 'POST', body: fd })
      setUploadDone(true)
      void qc.invalidateQueries({ queryKey: ['workboard'] })
      void qc.invalidateQueries({ queryKey: ['team', 'enrollment-requests'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const badge = BADGE[lead.status] ?? 'bg-muted/30 text-muted-foreground border-white/10'
  const isWatched = lead.status === 'video_watched' || lead.call_status === 'video_watched'
  const isSent    = !isWatched && (lead.status === 'video_sent' || lead.call_status === 'video_sent')
  const slaMs = timerRemainingMs(lead.last_action_at ?? null, lead.created_at, nowMs)
  const slaOverdue = slaMs < 0
  const slaRemainingSec = Math.max(0, Math.floor(slaMs / 1000))
  const slaTone = leadSlaTone(slaOverdue ? 0 : slaRemainingSec)
  const { hourAngle: slaHourAngle, minuteAngle: slaMinuteAngle, secondAngle: slaSecondAngle } =
    leadSlaClockAngles(slaOverdue ? 0 : slaMs)
  const mindsetStartable =
    lead.status === 'paid' &&
    !!(lead.payment_proof_url ?? '').trim() &&
    lead.payment_status === 'approved' &&
    !lead.mindset_started_at
  const mindsetReady =
    lead.status === 'mindset_lock' &&
    !!(lead.payment_proof_url ?? '').trim() &&
    lead.payment_status === 'approved' &&
    lead.mindset_lock_state !== 'leader_assigned'
  const startedAtMs = lead.mindset_started_at ? new Date(lead.mindset_started_at).getTime() : null
  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0
  const remainingSeconds = Math.max(0, MIN_MINDSET_SECONDS - elapsedSeconds)
  const { unlocked, canSend, leaderName: previewName } = getMindsetLockSendState({
    mindsetReady,
    remainingSeconds,
    preview: mindsetPreview,
  })
  const isLeaderMindsetFlow = role === 'leader'
  const lockLineClass = unlocked ? 'text-emerald-300' : 'text-red-300'
  const targetName = isLeaderMindsetFlow && previewName === 'Leader will be assigned on send' ? 'You' : previewName
  const mindsetFlowCopy = unlocked
    ? isLeaderMindsetFlow
      ? '5-minute call complete. Start Day 1 now.'
      : '5-minute call complete. Send now to move this lead into Day 1.'
    : isLeaderMindsetFlow
      ? 'Complete the full 5-minute call to unlock Day 1 start.'
      : 'Complete the full 5-minute call to unlock Day 1 handoff.'
  const callOptions = callStatusSelectOptions(role ?? null, lead.status as LeadStatus)
  const rawCallStatus = (lead.call_status ?? '').trim()
  const callValue = callOptions.some((option) => option.value === rawCallStatus)
    ? rawCallStatus
    : (callOptions[0]?.value ?? 'not_called')
  const showLeadContactActions = !stageOpsCard || role === 'leader' || role === 'admin'
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-2xl border p-3 text-card-foreground backdrop-blur-md sm:p-3.5',
        'bg-card/90 dark:bg-card/80 supports-[backdrop-filter]:bg-card/75 supports-[backdrop-filter]:dark:bg-card/60',
        slaTone.border,
        slaTone.cardGlow,
      )}
    >
      <div
        className={cn('absolute bottom-2 left-0 top-2 w-[3px] rounded-full', slaTone.leftBorder)}
        aria-hidden
      />
      <div className="relative flex flex-col gap-2.5 pl-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-tight text-foreground sm:text-base">{lead.name}</p>
            {lead.city && <p className="mt-0.5 break-words text-ds-caption text-muted-foreground">{lead.city}</p>}
          </div>
          <span className={cn('self-start rounded-full border px-2 py-0.5 text-ds-caption font-semibold', badge)}>{slabel(lead.status)}</span>
        </div>
        {!stageOpsCard && isWatched ? (
          <div className="flex items-center gap-1.5 rounded-md bg-blue-400/10 px-2 py-1 text-ds-caption font-medium text-blue-300">
            <Eye className="size-3.5 shrink-0" aria-hidden />
            <span>Prospect watched the video — call now!</span>
          </div>
        ) : null}
        {!stageOpsCard && isSent ? (
          <div className="flex items-center gap-1.5 rounded-md bg-indigo-400/10 px-2 py-1 text-ds-caption font-medium text-indigo-300">
            <Send className="size-3.5 shrink-0" aria-hidden />
            <span>Video sent — waiting for response</span>
          </div>
        ) : null}
        {!stageOpsCard ? (
          <select
            value={callValue}
            disabled={leadPatchBusy}
            aria-label={`Call status for ${lead.name}`}
            onChange={(e) => void pm.mutateAsync({ id: lead.id, body: { call_status: e.target.value } })}
            className="w-full min-w-0 rounded-md border border-border bg-muted/30 px-2 py-2 text-ds-caption text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
          >
            {callOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className={cn('relative size-8 shrink-0 rounded-full', slaTone.glow)}>
              <svg viewBox="0 0 40 40" className="size-full" aria-hidden>
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="transparent"
                  stroke={slaTone.stroke}
                  strokeWidth="2"
                  strokeOpacity="0.5"
                />
                <line
                  x1="20"
                  y1="20"
                  x2="20"
                  y2="10"
                  stroke={slaTone.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  transform={`rotate(${slaHourAngle}, 20, 20)`}
                />
                <line
                  x1="20"
                  y1="20"
                  x2="20"
                  y2="7"
                  stroke={slaTone.stroke}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  transform={`rotate(${slaMinuteAngle}, 20, 20)`}
                />
                <line
                  x1="20"
                  y1="20"
                  x2="20"
                  y2="5"
                  stroke={slaTone.stroke}
                  strokeWidth="1"
                  strokeLinecap="round"
                  transform={`rotate(${slaSecondAngle}, 20, 20)`}
                />
                <circle cx="20" cy="20" r="2" fill={slaTone.stroke} />
              </svg>
            </div>
            <div>
              <p className={cn('text-ds-caption font-semibold leading-tight', slaTone.text)}>
                {slaOverdue ? formatCountdown(slaMs) : formatLeadSlaTime(slaRemainingSec)}
              </p>
              <p className="text-ds-caption text-muted-foreground">{slaOverdue ? 'SLA' : 'remaining'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {showLeadContactActions ? (
              <>
                <LeadContactActions phone={lead.phone} />
                {!stageOpsCard ? (
                  <IconBtn title="Send Video" colorHover="hover:border-indigo-400/40 hover:text-indigo-400 disabled:opacity-50"
                    onClick={() => void pm.mutateAsync({ id: lead.id, body: { call_status: 'video_sent', status: 'video_sent' as LeadStatus } })}>
                    <Video className="h-3.5 w-3.5"/>
                  </IconBtn>
                ) : null}
              </>
            ) : null}
            {/* ₹196 proof upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleProofFile(file)
                e.target.value = ''
              }}
            />
            {showProofControl ? (
              proofApproved ? (
                <span title="Proof approved" className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/12 text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              ) : proofPending ? (
                <span title="Proof pending review" className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/12 text-sky-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              ) : mayUploadProof ? (
                <button
                  type="button"
                  title={uploading ? 'Uploading…' : uploadError ? `Retry — ${uploadError}` : 'Upload ₹196 proof'}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/30 transition disabled:opacity-50',
                    uploadError
                      ? 'border-red-400/40 text-red-400 hover:bg-red-400/10'
                      : 'border-border text-foreground hover:border-amber-400/40 hover:text-amber-400',
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
              ) : null
            ) : null}
            <Link to={`/dashboard/work/leads/${lead.id}`} title="Edit"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30 transition hover:border-primary/40 hover:text-primary">
              <Pencil className="h-3.5 w-3.5"/>
            </Link>
          </div>
        </div>
        {mindsetStartable ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2">
            <p className="text-ds-caption text-muted-foreground">
              {isLeaderMindsetFlow
                ? 'Payment approved. Start the 5-minute mindset lock before Day 1.'
                : 'Payment approved. Start the 5-minute mindset lock before leader handoff.'}
            </p>
            <button
              type="button"
              disabled={leadPatchBusy}
              onClick={() => void pm.mutateAsync({ id: lead.id, body: { status: 'mindset_lock' as LeadStatus } })}
              className="flex h-8 w-full items-center justify-center gap-1 rounded-md border border-fuchsia-400/40 bg-fuchsia-400/12 px-2 text-ds-caption font-semibold text-fuchsia-300 transition hover:bg-fuchsia-400/20 disabled:opacity-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Start Mindset Lock</span>
            </button>
          </div>
        ) : null}
        {mindsetReady ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2">
            <p className={cn('text-ds-caption font-semibold', lockLineClass)}>
              Minimum call time: {mmss(remainingSeconds)}
            </p>
            <p className="text-ds-caption text-muted-foreground">
              {mindsetFlowCopy}
            </p>
            <p className="text-ds-caption text-muted-foreground">
              {isLeaderMindsetFlow ? 'Day 1 owner' : 'Day 1 handoff'}:{' '}
              <span className="font-semibold text-foreground">{targetName}</span>
            </p>
            <button
              type="button"
              title={
                !canSend
                  ? isLeaderMindsetFlow
                    ? 'Complete at least 5 minutes call before starting Day 1'
                    : 'Complete at least 5 minutes call before sending'
                  : isLeaderMindsetFlow
                    ? 'Start Day 1 now'
                    : 'Send to leader and move to Day 1'
              }
              disabled={!canSend || mindsetBusy}
              onClick={() => onRequestMindsetSend?.(lead)}
              className={cn(
                'flex h-8 w-full items-center justify-center gap-1 rounded-md border px-2 text-ds-caption font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                canSend
                  ? 'border-emerald-400/40 bg-emerald-400/12 text-emerald-300 hover:bg-emerald-400/20'
                  : 'border-red-400/30 bg-red-400/10 text-red-300',
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>
                {mindsetBusy
                  ? isLeaderMindsetFlow
                    ? 'Starting...'
                    : 'Sending...'
                  : isLeaderMindsetFlow
                    ? 'Lock & Start Day 1'
                    : 'Lock & Send to Leader'}
              </span>
            </button>
          </div>
        ) : null}
        {stageKey ? (
          <StageAdvanceSection
            lead={lead}
            stageKey={stageKey}
            pm={pm}
            leadPatchBusy={leadPatchBusy}
            onMoveNext={onMoveNext}
            nextLabel={nextLabel}
          />
        ) : null}
      </div>
    </article>
  )
})

// ── StageAdvanceSection — day flow + post-Day-3 progression ──────────────────
function StageAdvanceSection({ lead, stageKey, pm, leadPatchBusy, onMoveNext, nextLabel }: {
  lead: LeadPublic
  stageKey: WorkboardStageKey
  pm: PM
  leadPatchBusy: boolean
  onMoveNext?: () => void
  nextLabel?: string
}) {
  const [sharingSlot, setSharingSlot] = useState<BatchSlotKey | null>(null)
  const [toggleSlot, setToggleSlot] = useState<BatchSlotKey | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)

  if (stageKey === 'day3' || stageKey === 'interview' || stageKey === 'track_selected' || stageKey === 'seat_hold') {
    const copy: Record<Exclude<WorkboardStageKey, 'day1' | 'day2'>, string> = {
      day3: 'Day 3 closer stage. Confirm completion when this lead is ready for interview.',
      interview: 'Interview stage. Move ahead once the interview has been completed.',
      track_selected: 'Track selected stage. Advance once the track choice is finalized.',
      seat_hold: 'Seat hold stage. Move ahead after the seat hold is confirmed.',
    }
    return (
      <div className="space-y-1.5 border-t border-border/40 pt-1.5">
        <p className="text-ds-caption text-muted-foreground">{copy[stageKey]}</p>
        {onMoveNext ? (
          <button
            type="button"
            disabled={leadPatchBusy}
            onClick={onMoveNext}
            className="w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            {nextLabel ?? 'Move to next stage →'}
          </button>
        ) : null}
      </div>
    )
  }

  const dayKey = stageKey === 'day1' ? 1 : 2
  const batchSlots = stageKey === 'day1'
    ? (['d1_morning', 'd1_afternoon', 'd1_evening'] as const)
    : (['d2_morning', 'd2_afternoon', 'd2_evening'] as const)
  const done = batchSlots.every((k) => lead[k])
  const showDay2TestSend = stageKey === 'day2' && done

  const handleBatchShare = async (slot: 'M' | 'A' | 'E', slotKey: BatchSlotKey) => {
    setBatchError(null)
    setSharingSlot(slotKey)
    try {
      const res = await apiFetch(`/api/v1/leads/${lead.id}/batch-share-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slotKey }),
      })
      if (!res.ok) {
        throw new Error(await readResponseError(res))
      }
      const body = (await res.json()) as { watch_url_v1?: string; watch_url_v2?: string }
      const tokenizedLinks = { v1: body.watch_url_v1, v2: body.watch_url_v2 }
      const waUrl = workboardBatchWhatsAppUrl(lead, dayKey, slot, tokenizedLinks)
      if (!waUrl) {
        throw new Error('Phone number missing for WhatsApp batch share.')
      }
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not generate batch links')
    } finally {
      setSharingSlot(null)
    }
  }

  const handleBatchToggle = async (slotKey: BatchSlotKey) => {
    setBatchError(null)
    setToggleSlot(slotKey)
    try {
      await pm.mutateAsync({ id: lead.id, body: { [slotKey]: !lead[slotKey] } })
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not update batch state')
    } finally {
      setToggleSlot(null)
    }
  }

  return (
    <div className="space-y-1.5 border-t border-border/40 pt-1.5">
      <div className="flex items-center gap-2">
        <span className="text-ds-caption text-muted-foreground">Links:</span>
        {batchSlots.map((slotKey, i) => {
          const slot = (['M', 'A', 'E'] as const)[i]
          const slotDone = lead[slotKey]
          const busy = sharingSlot === slotKey
          return (
            <button
              key={`share-${slotKey}`}
              type="button"
              disabled={leadPatchBusy || busy}
              onClick={() => void handleBatchShare(slot, slotKey)}
              className={cn(
                'flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-ds-caption font-semibold transition disabled:opacity-50',
                slotDone
                  ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                  : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary',
              )}
            >
              {busy ? '...' : slot}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-ds-caption text-muted-foreground">Check:</span>
        {batchSlots.map((slotKey, i) => {
          const slot = (['M', 'A', 'E'] as const)[i]
          const slotDone = lead[slotKey]
          const busy = toggleSlot === slotKey
          return (
            <button
              key={`toggle-${slotKey}`}
              type="button"
              disabled={leadPatchBusy || busy}
              onClick={() => void handleBatchToggle(slotKey)}
              className={cn(
                'flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-ds-caption font-semibold transition disabled:opacity-50',
                slotDone
                  ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                  : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary',
              )}
            >
              {busy ? '...' : slotDone ? <CheckSquare className="h-3 w-3" /> : <span>{slot}</span>}
            </button>
          )
        })}
      </div>
      {batchError ? <p className="text-ds-caption text-destructive">{batchError}</p> : null}
      {showDay2TestSend && (
        <button type="button" disabled={leadPatchBusy}
          onClick={() => { const u = day2TestWhatsAppUrl(lead); if (u) window.open(u, '_blank', 'noopener,noreferrer'); void pm.mutateAsync({ id: lead.id, body: { whatsapp_sent: true } }) }}
          className="w-full rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-ds-caption font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50">
          Send Test on WhatsApp
        </button>
      )}
      {done && onMoveNext && (
        <button type="button" disabled={leadPatchBusy} onClick={onMoveNext}
          className="w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
          {nextLabel ?? 'Move to next stage →'}
        </button>
      )}
    </div>
  )
}

function ResponsiveLeadGrid({
  leads,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  onRequestMindsetSend,
  empty,
  nowMs,
  stageKey,
  nextStatus,
  nextLabel,
}: {
  leads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
  empty?: string
  nowMs: number
  stageKey?: WorkboardStageKey
  nextStatus?: LeadStatus
  nextLabel?: string
}) {

  if (leads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-ds-caption text-muted-foreground">
        {empty ?? 'No leads'}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => {
        const onMoveNext = stageKey && nextStatus
          ? () => void pm.mutateAsync({ id: lead.id, body: { status: nextStatus } })
          : undefined
        return (
          <LeadCard
            key={lead.id}
            lead={lead}
            stageKey={stageKey}
            pm={pm}
            leadPatchBusy={patchBusyLeadId === lead.id}
            mindsetBusy={mindsetBusyLeadId === lead.id}
            mindsetPreview={mindsetPreviewByLeadId[lead.id] ?? null}
            onRequestMindsetSend={onRequestMindsetSend}
            onMoveNext={onMoveNext}
            nextLabel={nextLabel}
            nowMs={nowMs}
          />
        )
      })}
    </div>
  )
}

// ── Grid section helper ────────────────────────────────────────────────────────
function Grid({
  leads,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId = null,
  mindsetPreviewByLeadId = {},
  onRequestMindsetSend,
  empty,
  nowMs,
  stageKey,
  nextStatus,
  nextLabel,
}: {
  leads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId?: number | null
  mindsetPreviewByLeadId?: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
  empty?: string
  nowMs: number
  stageKey?: WorkboardStageKey
  nextStatus?: LeadStatus
  nextLabel?: string
}) {
  return (
    <ResponsiveLeadGrid
      leads={leads}
      pm={pm}
      patchBusyLeadId={patchBusyLeadId}
      mindsetBusyLeadId={mindsetBusyLeadId}
      mindsetPreviewByLeadId={mindsetPreviewByLeadId}
      onRequestMindsetSend={onRequestMindsetSend}
      empty={empty}
      nowMs={nowMs}
      stageKey={stageKey}
      nextStatus={nextStatus}
      nextLabel={nextLabel}
    />
  )
}

// ── TeamView ───────────────────────────────────────────────────────────────────
function MindsetQueueView({
  cols,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  ensureMindsetPreview,
  onRequestMindsetSend,
  search,
  nowMs,
  queueRole,
  currentUserId,
}: {
  cols: Col[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  ensureMindsetPreview: (lead: LeadPublic) => void
  onRequestMindsetSend?: (lead: LeadPublic) => void
  search: string
  nowMs: number
  queueRole: 'team' | 'leader'
  currentUserId: number | null
}) {
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const allowLead = (lead: LeadPublic) =>
    queueRole !== 'leader' || (currentUserId != null && lead.assigned_to_user_id === currentUserId)
  const paidLeads = (byS.paid?.items ?? []).filter(
    (l) =>
      allowLead(l) &&
      l.payment_status === 'approved' &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)),
  )
  const mindsetLeads = (byS.mindset_lock?.items ?? []).filter(
    (l) =>
      allowLead(l) &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)),
  )
  const mindsetQueue = [...paidLeads, ...mindsetLeads]
  useEffect(() => {
    mindsetLeads.forEach((lead) => {
      const ready =
        lead.status === 'mindset_lock' &&
        !!(lead.payment_proof_url ?? '').trim() &&
        lead.payment_status === 'approved' &&
        lead.mindset_lock_state !== 'leader_assigned'
      if (!ready) return
      if (Object.prototype.hasOwnProperty.call(mindsetPreviewByLeadId, lead.id)) return
      ensureMindsetPreview(lead)
    })
  }, [mindsetLeads, mindsetPreviewByLeadId, ensureMindsetPreview])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Mindset Lock</h2>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-ds-caption font-semibold tabular-nums text-muted-foreground">
          {mindsetQueue.length}
        </span>
      </div>
      <Grid
        leads={mindsetQueue}
        pm={pm}
        patchBusyLeadId={patchBusyLeadId}
        mindsetBusyLeadId={mindsetBusyLeadId}
        mindsetPreviewByLeadId={mindsetPreviewByLeadId}
        onRequestMindsetSend={onRequestMindsetSend}
        empty={
          queueRole === 'leader'
            ? 'No personal paid or mindset-lock leads yet'
            : 'No paid or mindset-lock leads yet'
        }
        nowMs={nowMs}
      />
    </div>
  )
}

function LeaderView({
  cols,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  ensureMindsetPreview,
  onRequestMindsetSend,
  search,
  nowMs,
  currentUserId,
}: {
  cols: Col[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  ensureMindsetPreview: (lead: LeadPublic) => void
  onRequestMindsetSend?: (lead: LeadPublic) => void
  search: string
  nowMs: number
  currentUserId: number | null
}) {
  return (
    <div className="space-y-6">
      <MindsetQueueView
        cols={cols}
        pm={pm}
        patchBusyLeadId={patchBusyLeadId}
        mindsetBusyLeadId={mindsetBusyLeadId}
        mindsetPreviewByLeadId={mindsetPreviewByLeadId}
        ensureMindsetPreview={ensureMindsetPreview}
        onRequestMindsetSend={onRequestMindsetSend}
        search={search}
        nowMs={nowMs}
        queueRole="leader"
        currentUserId={currentUserId}
      />
      <AdminView cols={cols} pm={pm} patchBusyLeadId={patchBusyLeadId} search={search} nowMs={nowMs} />
    </div>
  )
}

// ── AdminView ──────────────────────────────────────────────────────────────────
type ATab = WorkboardStageKey | 'closing'
function AdminView({ cols, pm, patchBusyLeadId, search, nowMs }: {
  cols: Col[]
  pm: PM
  patchBusyLeadId: number | null
  search: string
  nowMs: number
}) {
  const [tab, setTab] = useState<ATab>('day1')
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const f = (statuses: string[]) =>
    statuses.flatMap((s) => (byS[s]?.items ?? []).filter((l) =>
      !needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)))
  const tabData = ADMIN_STAGE_TABS.map((config) => ({
    ...config,
    items: f(config.statuses),
  }))
  const tabs = tabData.map((config) => ({
    id: config.id,
    label: config.label,
    count: config.items.length,
  }))
  const active = tabData.find((config) => config.id === tab) ?? tabData[0]
  const day2 = tabData.find((config) => config.id === 'day2')?.items ?? []

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as ATab)}/>
      {active?.id === 'day2' ? (
        <div className="space-y-3">
          {/* Day 2 summary chips */}
          <div className="flex flex-wrap gap-2">
            {[['Complete', day2.filter((l) => !!l.day2_completed_at).length, 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25'],
              ['In Progress', day2.filter((l) => !l.day2_completed_at && !!l.day1_completed_at).length, 'bg-amber-400/15 text-amber-300 border-amber-400/25'],
              ['Not Started', day2.filter((l) => !l.day1_completed_at).length, 'bg-muted/30 text-muted-foreground border-white/10'],
            ].map(([label, count, cls]) =>
              <span key={label as string} className={cn('rounded-full border px-2.5 py-0.5 text-ds-caption font-medium', cls as string)}>{label}: {count}</span>)}
          </div>
          <Grid leads={day2} stageKey="day2" nextStatus="day3" nextLabel="Move to Day 3 →" pm={pm} patchBusyLeadId={patchBusyLeadId} nowMs={nowMs} />
        </div>
      ) : active?.id === 'closing' ? (
        <div className="space-y-6">
          {CLOSE.map((s) => {
            const items = f([s])
            const badge = BADGE[s] ?? ''
            return (
              <div key={s} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{slabel(s)}</h3>
                  <span className={cn('rounded-full border px-2 py-0.5 text-ds-caption font-semibold', badge)}>{items.length}</span>
                </div>
                <Grid leads={items} pm={pm} patchBusyLeadId={patchBusyLeadId} empty="No leads" nowMs={nowMs} />
              </div>
            )
          })}
        </div>
      ) : active?.stageKey ? (
        <Grid
          leads={active.items}
          stageKey={active.stageKey}
          nextStatus={active.nextStatus}
          nextLabel={active.nextLabel}
          pm={pm}
          patchBusyLeadId={patchBusyLeadId}
          nowMs={nowMs}
        />
      ) : null}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function WorkboardPage({ title }: Props) {
  const { role } = useDashboardShellRole()
  const { data: me } = useAuthMeQuery()
  const qc = useQueryClient()
  const { data, isPending, isError, error, refetch } = useWorkboardQuery(true)
  const pm = usePatchLeadMutation()
  const patchBusyLeadId =
    pm.isPending && pm.variables && typeof pm.variables.id === 'number' ? pm.variables.id : null
  const [mindsetBusyLeadId, setMindsetBusyLeadId] = useState<number | null>(null)
  const [mindsetErr, setMindsetErr] = useState<string | null>(null)
  const [mindsetPreviewByLeadId, setMindsetPreviewByLeadId] = useState<
    Record<number, MindsetLockPreviewResponse | undefined>
  >({})
  const [confirmLead, setConfirmLead] = useState<LeadPublic | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [qInput, setQInput] = useState('')
  const [search, setSearch] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const currentUserId = me?.authenticated ? (me.user_id ?? null) : null
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), LEAD_SLA_SMOOTH_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(qInput), 350)
    return () => window.clearTimeout(id)
  }, [qInput])
  const cols: Col[] = useMemo(() => {
    const raw = data?.columns
    if (!raw?.length) return []
    return raw.map((c) => ({
      status: c.status,
      total: typeof c.total === 'number' ? c.total : 0,
      items: Array.isArray(c.items) ? c.items : [],
    }))
  }, [data])

  useEffect(() => {
    if (!toastMsg) return
    const id = window.setTimeout(() => setToastMsg(null), 2200)
    return () => window.clearTimeout(id)
  }, [toastMsg])

  const ensureMindsetPreview = useCallback((lead: LeadPublic) => {
    let shouldFetch = false
    setMindsetPreviewByLeadId((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, lead.id)) return prev
      shouldFetch = true
      return { ...prev, [lead.id]: undefined }
    })
    if (!shouldFetch) return
    void (async () => {
      try {
        const p = await fetchMindsetLockPreview(lead.id)
        setMindsetPreviewByLeadId((prev) => ({ ...prev, [lead.id]: p }))
      } catch {
        setMindsetPreviewByLeadId((prev) => ({ ...prev, [lead.id]: undefined }))
      }
    })()
  }, [])

  async function completeMindsetLock(leadId: number) {
    setMindsetErr(null)
    setMindsetBusyLeadId(leadId)
    try {
      await postMindsetLockComplete(leadId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workboard'] }),
        qc.invalidateQueries({ queryKey: ['leads'] }),
      ])
      await refetch()
      setMindsetPreviewByLeadId((prev) => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
      setToastMsg('Lead moved to Day 1')
    } catch (e) {
      setMindsetErr(e instanceof Error ? e.message : 'Could not complete mindset lock')
    } finally {
      setMindsetBusyLeadId(null)
      setConfirmLead(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {role === 'admin'
              ? 'Organization view — all active leads.'
              : role === 'leader'
                ? 'Your personal mindset queue plus execution pipeline.'
                : 'Your personal pipeline.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/work/add-lead">Add Lead</Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="surface-elevated px-4 py-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden/>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)}
            placeholder="Search by name or phone…"
            className="field-input w-full pl-9 pr-3"/>
        </div>
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-32 rounded-xl"/>)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="surface-elevated px-4 py-3 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load workboard.'}{' '}
          <Button type="button" variant="ghost" size="sm" className="h-auto p-0" onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {/* Mutation error */}
      {pm.isError && (
        <p className="text-ds-caption text-destructive" role="alert">
          {pm.error instanceof Error ? pm.error.message : 'Could not update lead'}
        </p>
      )}
      {mindsetErr ? (
        <p className="text-ds-caption text-destructive" role="alert">
          {mindsetErr}
        </p>
      ) : null}

      {/* Main content */}
      {data && !isPending && (
        role === 'team'
          ? (
            <MindsetQueueView
              cols={cols}
              pm={pm}
              patchBusyLeadId={patchBusyLeadId}
              mindsetBusyLeadId={mindsetBusyLeadId}
              mindsetPreviewByLeadId={mindsetPreviewByLeadId}
              ensureMindsetPreview={ensureMindsetPreview}
              onRequestMindsetSend={(lead) => setConfirmLead(lead)}
              search={search}
              nowMs={nowMs}
              queueRole="team"
              currentUserId={currentUserId}
            />
          )
          : role === 'leader'
            ? (
              <LeaderView
                cols={cols}
                pm={pm}
                patchBusyLeadId={patchBusyLeadId}
                mindsetBusyLeadId={mindsetBusyLeadId}
                mindsetPreviewByLeadId={mindsetPreviewByLeadId}
                ensureMindsetPreview={ensureMindsetPreview}
                onRequestMindsetSend={(lead) => setConfirmLead(lead)}
                search={search}
                nowMs={nowMs}
                currentUserId={currentUserId}
              />
            )
            : <AdminView cols={cols} pm={pm} patchBusyLeadId={patchBusyLeadId} search={search} nowMs={nowMs} />
      )}
      {confirmLead ? (
        <div className="keyboard-safe-modal fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="keyboard-safe-sheet w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
              {role === 'leader' ? 'Start Day 1?' : 'Send to Leader?'}
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {role === 'leader' ? (
                <>
                  <li>You have completed mindset call (5–10 min)</li>
                  <li>This action will move the lead into your Day 1 queue</li>
                  <li>You can continue execution from the Day 1 tab</li>
                </>
              ) : (
                <>
                  <li>You have completed mindset call (5–10 min)</li>
                  <li>This action will move the lead to Day 1 under your leader</li>
                  <li>You won’t be able to edit after this</li>
                </>
              )}
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmLead(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void completeMindsetLock(confirmLead.id)}
                disabled={mindsetBusyLeadId === confirmLead.id}
              >
                {mindsetBusyLeadId === confirmLead.id
                  ? role === 'leader'
                    ? 'Starting…'
                    : 'Sending…'
                  : role === 'leader'
                    ? 'Confirm & Start Day 1'
                    : 'Confirm & Send'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {toastMsg ? (
        <div className="fixed bottom-24 right-4 z-[85] rounded-md border border-emerald-400/35 bg-emerald-400/15 px-3 py-2 text-ds-caption font-semibold text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
