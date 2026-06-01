import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Check, CheckSquare, Eye, Pencil, Search, Send, Video, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { LiveSessionSlotPicker } from '@/components/leads/LiveSessionSlotPicker'
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
import { apiFetch, apiUrl } from '@/lib/api'
import { callStatusSelectOptions } from '@/lib/call-status-options'
import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import {
  closeExternalShareWindow,
  completeExternalShareWindow,
  openExternalShareUrl,
  reserveExternalShareWindow,
} from '@/lib/external-share-window'
import { getMindsetLockSendState } from '@/lib/mindset-lock'
import { useContentLinksQuery } from '@/hooks/use-content-links-query'
import { checklistForStage } from '@/lib/lead-process-map'
import { LEAD_SLA_SMOOTH_REFRESH_MS, formatLeadSlaTime, leadSlaClockAngles, leadSlaTone } from '@/lib/lead-sla'
import { type LiveSessionSlotOption } from '@/lib/live-session-slots'
import { buildDay2BusinessTestWhatsAppUrl } from '@/lib/day2-business-test'
import { whatsAppChatWithTextHref, whatsappDigits } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = { title: string; mode?: 'mindset-lock' | 'pipeline' }
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
  day4:           'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  day5:           'bg-teal-400/15 text-teal-300 border-teal-400/25',
  interview:      'bg-lime-400/15 text-lime-300 border-lime-400/25',
  converted:      'bg-green-500/15 text-green-300 border-green-500/25',
  lost:           'bg-destructive/15 text-destructive border-destructive/25',
}
const CLOSE:  LeadStatus[] = ['converted','lost']
const MIN_MINDSET_SECONDS = 300
type BatchSlotKey = 'd1_morning' | 'd1_afternoon' | 'd1_evening' | 'd2_morning' | 'd2_afternoon' | 'd2_evening'
type WorkboardStageKey =
  | 'day1'
  | 'day2'
  | 'day3'
const slabel  = (s: string) => LEAD_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

const ADMIN_STAGE_TABS: {
  id: WorkboardStageKey | 'closing'
  label: string
  statuses: LeadStatus[]
  stageKey?: WorkboardStageKey
  nextStatus?: LeadStatus
  nextLabel?: string
}[] = [
  { id: 'day1', label: 'Day 1', statuses: ['day1'], stageKey: 'day1', nextStatus: 'day2', nextLabel: 'Push to Day 2' },
  { id: 'day2', label: 'Day 2', statuses: ['day2'], stageKey: 'day2', nextStatus: 'day3', nextLabel: 'Push to Day 3' },
  { id: 'day3', label: 'Day 3', statuses: ['day3'], stageKey: 'day3', nextStatus: 'converted', nextLabel: 'Mark converted' },
  { id: 'closing', label: 'Closing', statuses: CLOSE },
]

const STATUS_TAB_LABEL: Partial<Record<LeadStatus, string>> = {
  day1: 'Day 1', day2: 'Day 2', day3: 'Day 3',
  converted: 'Closing', lost: 'Closing',
}
type ATab = WorkboardStageKey | 'closing'

function parseAdminTab(value: string | null): ATab {
  const match = ADMIN_STAGE_TABS.find((tab) => tab.id === value)
  return (match?.id ?? 'day2') as ATab
}

function workboardBatchWhatsAppUrl(
  lead: LeadPublic,
  dayKey: 1 | 2 | 3 | 4 | 5 | 6,
  slot: 'M' | 'A' | 'E' | '6PM' | '8PM',
  links?: { v1?: string; v2?: string },
): string | null {
  if (!whatsappDigits(lead.phone ?? '')) return null
  const name = (lead.name || 'Participant').trim()
  const isDay6 = dayKey === 6
  const slotLabel = slot === 'M' ? 'Morning' : slot === 'A' ? 'Afternoon' : slot === 'E' ? 'Evening' : slot === '6PM' ? '6 PM' : '8 PM'
  const linkBlock = isDay6
    ? (links?.v1 ? `📹 Final Video:\n${links.v1}\n` : '')
    : (links?.v1 ? `📹 Video 1:\n${links.v1}\n` : '') + (links?.v2 ? `📹 Video 2:\n${links.v2}\n` : '')
  const msg =
    `Hi ${name},\n` +
    `Day ${dayKey} — ${slotLabel} Batch\n` +
    (linkBlock ? `\n${linkBlock}` : '\n') +
    (isDay6 ? 'Please watch the final video and reply ✅.' : 'Please watch both videos and reply ✅.')
  const url = whatsAppChatWithTextHref(lead.phone, msg)
  return url === '#' ? null : url
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

function processTaskDone(lead: LeadPublic, stage: string, task: string): boolean {
  return Boolean(lead.process_tracking?.[stage]?.[task])
}

function stageChecklistComplete(lead: LeadPublic, stage: string): boolean {
  const def = checklistForStage(stage)
  if (!def) return true
  return def.tasks.every((task) => processTaskDone(lead, stage, task.key))
}

function cleanPersonName(value: string | null | undefined): string | null {
  const name = value?.trim()
  return name ? name : null
}

function workboardPeopleLabels(lead: LeadPublic): { ownerName: string | null; leaderName: string | null } {
  const ownerName = cleanPersonName(lead.owner_name)
  const assignedRole = cleanPersonName(lead.assigned_to_role)?.toLowerCase()
  const assignedLeaderName = assignedRole === 'leader' ? cleanPersonName(lead.assigned_to_name) : null
  const leaderName = assignedLeaderName ?? cleanPersonName(lead.leader_name) ?? cleanPersonName(lead.assigned_to_name)
  return {
    ownerName,
    leaderName: leaderName && leaderName !== ownerName ? leaderName : null,
  }
}

// ── Tiny shared primitives ─────────────────────────────────────────────────────
type PM = ReturnType<typeof usePatchLeadMutation>

function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-white/10">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cn('-mb-px shrink-0 border-b-2 px-2.5 py-2 text-ds-caption font-medium transition min-[400px]:px-3 sm:px-4 sm:text-sm',
            active === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}{t.count != null ? <span className="ml-1 tabular-nums text-muted-foreground/60">({t.count})</span> : null}
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
  showClosingActions,
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
  showClosingActions?: boolean
}) {
  const qc = useQueryClient()
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const [sendError, setSendError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const stageOpsCard = stageKey != null

  // Enrollment-Live send: create the single open token /watch/{token} link (detail-form
  // gate + first-open timer + auto video_sent→video_watched on finish), then WhatsApp it.
  async function handleSendFlpMinBillingVideo(option: LiveSessionSlotOption, useBusinessWhatsApp = false) {
    setSendError(null)
    try {
      const slotKey = `live_session_slot_${String(option.hour).padStart(2, '0')}_00`
      const res = await apiFetch('/api/v1/flp-min-billing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, live_session_slot_key: slotKey }),
      })
      if (!res.ok) throw new Error(await readResponseError(res))
      const data = (await res.json()) as { link?: { share_url?: string } }
      const share = data.link?.share_url
      const watchUrl = share ? `${window.location.origin}${share}` : null
      if (watchUrl) {
        const digits = whatsappDigits(lead.phone ?? '')
        const msg =
          `Hi ${lead.name || 'there'},\n\n` +
          `Aapki Day 1 (Enrollment Live) video ready hai. Is link pe apna naam aur registered number daal ke dekhiye:\n${watchUrl}`
        const waUrl = digits
          ? useBusinessWhatsApp
            ? `https://www.whatsapp.com/contact/${digits}?text=${encodeURIComponent(msg)}`
            : `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
          : null
        if (waUrl) openExternalShareUrl(waUrl)
      }
      setPickerOpen(false)
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send enrollment video')
    }
  }

  const badge = BADGE[lead.status] ?? 'bg-muted/30 text-muted-foreground border-white/10'
  const isWatched = lead.status === 'video_watched' || lead.call_status === 'video_watched'
  const isSent = !isWatched && (lead.status === 'video_sent' || lead.call_status === 'video_sent')
  const isReassigned = Boolean(lead.is_reassigned)
  const slaMs = timerRemainingMs(lead.last_action_at ?? null, lead.created_at, nowMs)
  const slaOverdue = slaMs < 0
  const slaRemainingSec = Math.max(0, Math.floor(slaMs / 1000))
  const slaTone = leadSlaTone(slaOverdue ? 0 : slaRemainingSec)
  const { hourAngle: slaHourAngle, minuteAngle: slaMinuteAngle, secondAngle: slaSecondAngle } =
    leadSlaClockAngles(slaOverdue ? 0 : slaMs)
  const mindsetStartable =
    lead.status === 'day1' &&
    !lead.mindset_started_at
  const mindsetReady =
    lead.status === 'mindset_lock' &&
    lead.mindset_lock_state !== 'leader_assigned'
  const startedAtMs = lead.mindset_started_at ? new Date(lead.mindset_started_at).getTime() : null
  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0
  const remainingSeconds = Math.max(0, MIN_MINDSET_SECONDS - elapsedSeconds)
  const { canSend } = getMindsetLockSendState({
    mindsetReady,
    remainingSeconds,
    preview: mindsetPreview,
  })
  const isLeaderMindsetFlow = surfaceRole === 'leader'
  const mindsetChecklistDone = stageChecklistComplete(lead, 'mindset_lock')
  const callOptions = callStatusSelectOptions(surfaceRole ?? null, lead.status as LeadStatus)
  const rawCallStatus = (lead.call_status ?? '').trim()
  const callValue = callOptions.some((option) => option.value === rawCallStatus)
    ? rawCallStatus
    : (callOptions[0]?.value ?? 'not_called')
  const showLeadContactActions = !stageOpsCard || surfaceRole === 'leader' || surfaceRole === 'admin'
  const { ownerName, leaderName } = workboardPeopleLabels(lead)
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-md border p-3 text-card-foreground backdrop-blur-md sm:p-3.5',
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
            {(ownerName || leaderName) && (
              <p className="mt-0.5 text-ds-caption text-muted-foreground/70">
                {ownerName && <span>Owner: {ownerName}</span>}
                {ownerName && leaderName && <span> · </span>}
                {leaderName && <span>Leader: {leaderName}</span>}
              </p>
            )}
          </div>
          <span className={cn('self-start rounded-full border px-2 py-0.5 text-ds-caption font-semibold', badge)}>{STATUS_TAB_LABEL[lead.status as LeadStatus] ?? slabel(lead.status)}</span>
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
        {isReassigned ? (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1 text-ds-caption font-medium text-amber-300">
            <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
            <span>Reassigned</span>
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
                    onClick={() => setPickerOpen(true)}>
                    <Video className="h-3.5 w-3.5"/>
                  </IconBtn>
                ) : null}
              </>
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
                ? 'Start Mindset Lock before pushing this lead into Day 2.'
                : 'Start the After Day 1 mindset lock before leader handoff.'}
            </p>
            <button
              type="button"
              disabled={leadPatchBusy}
              onClick={() => void pm.mutateAsync({ id: lead.id, body: { status: 'mindset_lock' as LeadStatus } })}
              className="flex h-10 w-full items-center justify-center gap-1 rounded-md border border-fuchsia-400/40 bg-fuchsia-400/12 px-3 text-ds-caption font-semibold text-fuchsia-300 transition hover:bg-fuchsia-400/20 disabled:opacity-50"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Start Mindset Lock</span>
            </button>
          </div>
        ) : null}
        {mindsetReady ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2">
            <ProcessChecklistSection
              lead={lead}
              stage="mindset_lock"
              pm={pm}
              leadPatchBusy={leadPatchBusy}
            />
            <button
              type="button"
              disabled={!canSend || !mindsetChecklistDone || mindsetBusy}
              onClick={() => onRequestMindsetSend?.(lead)}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-1 rounded-md border px-3 text-ds-caption font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                canSend && mindsetChecklistDone
                  ? 'border-emerald-400/40 bg-emerald-400/12 text-emerald-300 hover:bg-emerald-400/20'
                  : 'border-border bg-muted/30 text-muted-foreground',
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>
                {mindsetBusy ? 'Moving...' : isLeaderMindsetFlow ? 'Push to Day 2' : 'Send to Leader'}
              </span>
            </button>
          </div>
        ) : null}
        <LiveSessionSlotPicker
          open={pickerOpen}
          busy={pm.isPending}
          onClose={() => setPickerOpen(false)}
          onConfirm={(option, useBusiness) => void handleSendFlpMinBillingVideo(option, useBusiness)}
        />
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
        {showClosingActions && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={leadPatchBusy || lead.status === 'converted'}
              onClick={() => void pm.mutateAsync({ id: lead.id, body: { status: 'converted' } })}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 text-ds-caption font-semibold text-green-300 transition hover:bg-green-500/20 disabled:cursor-default disabled:opacity-40"
            >
              <Check className="size-3.5" />
              {lead.status === 'converted' ? 'Closed ✓' : 'Mark Closed'}
            </button>
            <button
              type="button"
              disabled={leadPatchBusy || lead.status === 'lost'}
              onClick={() => void pm.mutateAsync({ id: lead.id, body: { status: 'lost' } })}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 text-ds-caption font-semibold text-destructive transition hover:bg-destructive/20 disabled:cursor-default disabled:opacity-40"
            >
              <X className="size-3.5" />
              {lead.status === 'lost' ? 'Lost ✓' : 'Mark Lost'}
            </button>
          </div>
        )}
        {sendError ? (
          <p className="text-ds-caption text-destructive" role="alert">
            {sendError}
          </p>
        ) : null}
      </div>
    </article>
  )
})

function Checkbox({
  done,
  busy,
  disabled,
  onClick,
  'aria-label': ariaLabel,
}: {
  done: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition disabled:opacity-50',
        done
          ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400'
          : 'border-border bg-transparent text-transparent hover:border-primary/60',
      )}
    >
      {busy ? (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : done ? (
        <Check className="h-3 w-3" />
      ) : null}
    </button>
  )
}

function ProcessChecklistSection({
  lead,
  stage,
  pm,
  leadPatchBusy,
  onMoveNext,
  nextLabel,
  taskKeys,
}: {
  lead: LeadPublic
  stage: string
  pm: PM
  leadPatchBusy: boolean
  onMoveNext?: () => void
  nextLabel?: string
  taskKeys?: string[]
}) {
  const qc = useQueryClient()
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const { data: contentLinks = {} } = useContentLinksQuery()
  const def = checklistForStage(stage)

  if (!def) return null

  async function toggleTask(taskKey: string, done: boolean) {
    setTaskError(null)
    setBusyTask(taskKey)
    try {
      await pm.mutateAsync({
        id: lead.id,
        body: {
          process_stage: stage,
          process_task: taskKey,
          process_task_done: done,
        },
      })
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Could not update process task')
    } finally {
      setBusyTask(null)
    }
  }

  async function shareContentVideo(taskKey: string, videoUrl: string) {
    setTaskError(null)
    setBusyTask(taskKey)
    try {
      const msg = `Hi ${lead.name || 'there'},\n\nWatch this video:\n${videoUrl}`
      const waUrl = whatsAppChatWithTextHref(lead.phone, msg)
      if (waUrl === '#') throw new Error('Phone number missing or invalid.')
      if (!openExternalShareUrl(waUrl)) throw new Error('Could not open WhatsApp.')
      await toggleTask(taskKey, true)
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Could not share video')
      setBusyTask(null)
    }
  }

  const displayTasks = taskKeys ? def.tasks.filter((t) => taskKeys.includes(t.key)) : def.tasks
  const allDone = taskKeys
    ? displayTasks.every((t) => processTaskDone(lead, stage, t.key))
    : stageChecklistComplete(lead, stage)

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      {!taskKeys && (
        <div className="space-y-0.5">
          <p className="text-ds-caption font-bold uppercase tracking-wider text-foreground/70">{def.title}</p>
          <p className="text-ds-caption text-muted-foreground">{def.helper}</p>
        </div>
      )}
      <div className="space-y-1.5">
        {displayTasks.map((task) => {
          const done = processTaskDone(lead, stage, task.key)
          const busy = busyTask === task.key
          return (
            <div
              key={task.key}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all',
                done
                  ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
                  : 'border-border/50 bg-card/40',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />}
                <p className={cn('text-sm font-medium', done ? 'text-emerald-300/80' : 'text-foreground/90')}>
                  {task.label}
                </p>
              </div>
              {task.kind === 'share_video' ? (
                <button
                  type="button"
                  disabled={leadPatchBusy || busy}
                  onClick={() => {
                    const url = task.settingKey ? (contentLinks?.[task.settingKey] ?? '') : ''
                    if (url) void shareContentVideo(task.key, url)
                    else void toggleTask(task.key, !done)
                  }}
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-1 text-ds-caption font-semibold transition disabled:opacity-50',
                    done
                      ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                      : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20',
                  )}
                >
                  {busy ? 'Sharing…' : done ? 'Shared' : 'Share'}
                </button>
              ) : task.kind === 'whatsapp_video' ? (
                <button
                  type="button"
                  disabled={leadPatchBusy || busy}
                  onClick={() => {
                    const url = task.settingKey ? (contentLinks?.[task.settingKey] ?? '') : ''
                    if (url) void shareContentVideo(task.key, url)
                    else void toggleTask(task.key, !done)
                  }}
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-1 text-ds-caption font-semibold transition disabled:opacity-50',
                    done
                      ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                  )}
                >
                  {busy ? 'Sending…' : done ? 'Sent ✓' : 'Send to WhatsApp'}
                </button>
              ) : task.kind === 'open_video' ? (
                <div className="flex shrink-0 items-center gap-2">
                  {task.settingKey && contentLinks?.[task.settingKey] ? (
                    <a
                      href={contentLinks[task.settingKey]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20"
                    >
                      Watch
                    </a>
                  ) : (
                    <span className="text-ds-caption text-muted-foreground/60">No link set</span>
                  )}
                  <Checkbox done={done} busy={busy} disabled={leadPatchBusy || busy}
                    aria-label={done ? `Mark "${task.label}" incomplete` : `Mark "${task.label}" complete`}
                    onClick={() => void toggleTask(task.key, !done)} />
                </div>
              ) : (
                <Checkbox done={done} busy={busy} disabled={leadPatchBusy || busy}
                  aria-label={done ? `Mark "${task.label}" incomplete` : `Mark "${task.label}" complete`}
                  onClick={() => void toggleTask(task.key, !done)} />
              )}
            </div>
          )
        })}
      </div>
      {taskError ? <p className="text-ds-caption text-destructive">{taskError}</p> : null}
      {allDone && onMoveNext ? (
        <button
          type="button"
          disabled={leadPatchBusy}
          onClick={onMoveNext}
          className="w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
        >
          {nextLabel ?? def.nextLabel ?? 'Move to next stage'}
        </button>
      ) : null}
    </div>
  )
}

// ── Day 3 Stage picker (1/2/3) + seat-hold ──────────────────────────────────
const STAGE_OPTIONS = [
  { key: 'stage1', label: 'Stage 1', sub: 'Slow', priceCents: 800_000, seatHoldCents: 200_000 },
  { key: 'stage2', label: 'Stage 2', sub: 'Medium', priceCents: 1_800_000, seatHoldCents: 400_000 },
  { key: 'stage3', label: 'Stage 3', sub: 'Fast', priceCents: 3_800_000, seatHoldCents: 800_000 },
] as const

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN')}`
}

function Day3StagePicker({ lead, pm, leadPatchBusy }: {
  lead: LeadPublic; pm: PM; leadPatchBusy: boolean
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const selected = lead.stage_selected ?? null
  const seatHoldCents = lead.seat_hold_amount_cents ?? null
  const expiryMs = lead.seat_hold_expiry ? new Date(lead.seat_hold_expiry).getTime() : null
  const seatHeld = expiryMs != null && expiryMs > nowMs
  const seatExpired = expiryMs != null && expiryMs <= nowMs

  useEffect(() => {
    if (expiryMs == null) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiryMs])

  const patch = async (body: Record<string, unknown>, key: string) => {
    setErr(null)
    setBusy(key)
    try {
      await pm.mutateAsync({ id: lead.id, body })
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update stage')
    } finally {
      setBusy(null)
    }
  }

  const countdown = (() => {
    if (expiryMs == null || !seatHeld) return null
    const totalSec = Math.max(0, Math.ceil((expiryMs - nowMs) / 1000))
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    return `${h}h ${String(m).padStart(2, '0')}m left`
  })()

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <p className="text-ds-caption font-bold uppercase tracking-wider text-foreground/70">Stage Selection</p>
      <div className="grid grid-cols-3 gap-1.5">
        {STAGE_OPTIONS.map((s) => {
          const active = selected === s.key
          return (
            <button
              key={s.key}
              type="button"
              disabled={leadPatchBusy || busy !== null}
              onClick={() => void patch({ stage_selected: s.key }, s.key)}
              className={cn(
                'flex flex-col items-center rounded-lg border px-2 py-2 text-center transition disabled:opacity-50',
                active
                  ? 'border-cyan-400/50 bg-cyan-400/[0.12] text-cyan-200'
                  : 'border-border/50 bg-card/40 text-foreground/80 hover:border-cyan-400/30',
              )}
            >
              <span className="text-sm font-bold">{s.label}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.sub}</span>
              <span className="mt-1 text-xs font-semibold">{rupees(s.priceCents)}</span>
              <span className="text-[10px] text-muted-foreground">seat {rupees(s.seatHoldCents)}</span>
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="space-y-1.5 border-t border-border/40 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-ds-caption text-muted-foreground">
              Seat-hold {seatHoldCents != null ? rupees(seatHoldCents) : ''}
            </span>
            {seatHeld ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Held · {countdown}
              </span>
            ) : seatExpired ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                Expired
              </span>
            ) : null}
          </div>
          {seatHeld ? (
            <button
              type="button"
              disabled={leadPatchBusy || busy !== null}
              onClick={() => void patch({ collect_seat_hold: false }, 'release')}
              className="w-full rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-ds-caption font-semibold text-muted-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              {busy === 'release' ? 'Releasing…' : 'Release seat-hold'}
            </button>
          ) : (
            <button
              type="button"
              disabled={leadPatchBusy || busy !== null}
              onClick={() => void patch({ collect_seat_hold: true }, 'collect')}
              className="w-full rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-ds-caption font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {busy === 'collect' ? 'Saving…' : seatExpired ? 'Re-collect seat-hold' : 'Collect seat-hold'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-ds-caption text-muted-foreground">Pick a stage to set price + seat-hold.</p>
      )}
      {err ? <p className="text-ds-caption text-destructive">{err}</p> : null}
    </div>
  )
}

// ── Day 3 Stage payment — screenshot → leader account → admin approve ────────
function Day3StagePayment({ lead, leadPatchBusy }: { lead: LeadPublic; leadPatchBusy: boolean }) {
  const qc = useQueryClient()
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const isAdmin = surfaceRole === 'admin'

  const status = lead.payment_status ?? null // null | proof_uploaded | approved | rejected
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState(() =>
    lead.stage_price_cents != null ? String(Math.round(lead.stage_price_cents / 100)) : '',
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!lead.stage_selected) return null

  const refetch = () => qc.refetchQueries({ queryKey: ['workboard'] })

  const upload = async () => {
    setErr(null)
    if (!file) { setErr('Screenshot select karo.'); return }
    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) { setErr('Valid amount daalo.'); return }
    setBusy('upload')
    try {
      const form = new FormData()
      form.append('proof_file', file)
      form.append('lead_id', String(lead.id))
      form.append('payment_amount_cents', String(cents))
      form.append('notes', 'Day 3 stage payment')
      const res = await apiFetch('/api/v1/payments/proof/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await readResponseError(res))
      setFile(null)
      await refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const review = async (action: 'approve' | 'reject') => {
    setErr(null)
    setBusy(action)
    try {
      const res = await apiFetch(`/api/v1/payments/proof/${action}?lead_id=${lead.id}`, { method: 'POST' })
      if (!res.ok) throw new Error(await readResponseError(res))
      await refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not ${action}`)
    } finally {
      setBusy(null)
    }
  }

  const badge = (() => {
    if (status === 'approved') return ['Paid ✓ (recorded)', 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300']
    if (status === 'proof_uploaded') return ['Pending review', 'border-amber-400/30 bg-amber-400/15 text-amber-300']
    if (status === 'rejected') return ['Rejected', 'border-destructive/30 bg-destructive/15 text-destructive']
    return ['Not paid', 'border-border/50 bg-muted text-muted-foreground']
  })()

  const showForm = status == null || status === 'rejected'

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-ds-caption font-bold uppercase tracking-wider text-foreground/70">Stage Payment</p>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', badge[1])}>{badge[0]}</span>
      </div>
      <p className="text-ds-caption text-muted-foreground">Prospect ka payment leader ke account me. Screenshot upload → admin approve.</p>

      {lead.payment_proof_url ? (
        <a href={apiUrl(lead.payment_proof_url)} target="_blank" rel="noreferrer"
          className="block text-ds-caption font-semibold text-primary underline">
          View uploaded screenshot
        </a>
      ) : null}

      {showForm ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <span className="flex items-center rounded-md border border-border/50 bg-card/40 px-2 text-ds-caption text-muted-foreground">₹</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="Amount"
              className="h-9 flex-1 rounded-md border border-border/50 bg-card/40 px-2 text-sm outline-none focus:border-cyan-400/40"
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-ds-caption text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-primary"
          />
          <button
            type="button"
            disabled={leadPatchBusy || busy !== null}
            onClick={() => void upload()}
            className="w-full rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-ds-caption font-semibold text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {busy === 'upload' ? 'Uploading…' : 'Upload payment screenshot'}
          </button>
        </div>
      ) : null}

      {isAdmin && status === 'proof_uploaded' ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void review('approve')}
            className="flex-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-ds-caption font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {busy === 'approve' ? '…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void review('reject')}
            className="flex-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-ds-caption font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
          >
            {busy === 'reject' ? '…' : 'Reject'}
          </button>
        </div>
      ) : null}
      {err ? <p className="text-ds-caption text-destructive">{err}</p> : null}
    </div>
  )
}

// ── Day 2 cheat-proof business-test link + status ───────────────────────────
function Day2TestLinkRow({ lead, busy, onSend }: {
  lead: LeadPublic; busy: boolean; onSend: () => void
}) {
  const status = lead.day2_test_status ?? 'pending'
  const done = status === 'passed' || status === 'failed'
  const badge: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground border-border/50',
    in_progress: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    passed: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    failed: 'bg-destructive/15 text-destructive border-destructive/30',
  }
  const label: Record<string, string> = {
    pending: 'Test not started',
    in_progress: 'Test in progress',
    passed: `Passed${lead.day2_test_score != null ? ` (${lead.day2_test_score}/30)` : ''}`,
    failed: `Failed${lead.day2_test_score != null ? ` (${lead.day2_test_score}/30)` : ''}`,
  }
  return (
    <div className="border-t border-border/40 pt-1.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ds-caption font-semibold text-muted-foreground">Day 2 Business Test</span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', badge[status])}>
          {label[status]}
        </span>
      </div>
      {!done ? (
        <button type="button"
          disabled={busy}
          onClick={onSend}
          className="relative flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-400/15 to-emerald-400/10 px-3 text-sm font-bold text-cyan-200 transition hover:border-cyan-400/60 hover:from-cyan-400/20 disabled:opacity-50">
          <Send className="h-4 w-4 shrink-0" />
          <span>{busy ? 'Preparing...' : status === 'in_progress' ? 'Resend test link' : 'Send test link'}</span>
        </button>
      ) : (
        <p className="text-ds-caption text-muted-foreground">
          {status === 'passed'
            ? 'Test cleared — admin can advance to Day 3.'
            : 'Test failed — prospect cannot advance to Day 3.'}
        </p>
      )}
    </div>
  )
}

// ── StageAdvanceSection — day flow + post-Day-3 progression ──────────────────
function StageAdvanceSection({ lead, stageKey, pm, leadPatchBusy, onMoveNext, nextLabel }: {
  lead: LeadPublic
  stageKey: WorkboardStageKey
  pm: PM
  leadPatchBusy: boolean
  onMoveNext?: () => void
  nextLabel?: string
}) {
  const qc = useQueryClient()
  const [sharingSlot, setSharingSlot] = useState<BatchSlotKey | null>(null)
  const [toggleSlot, setToggleSlot] = useState<BatchSlotKey | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [testLinkBusy, setTestLinkBusy] = useState(false)

  const hasBatchSlots = stageKey === 'day1' || stageKey === 'day2'
  const dayKey = stageKey === 'day3' ? 3 : stageKey === 'day2' ? 2 : 1
  const batchSlots: readonly BatchSlotKey[] =
    stageKey === 'day2'
      ? (['d2_morning', 'd2_afternoon', 'd2_evening'] as const)
      : (['d1_morning', 'd1_afternoon', 'd1_evening'] as const)

  const allSlotsDone = hasBatchSlots && batchSlots.every((k) => lead[k])

  // day1 M/A slots — tokenized batch link
  const handleBatchShare = async (slot: 'M' | 'A' | 'E' | '6PM' | '8PM', slotKey: BatchSlotKey) => {
    setBatchError(null)
    setSharingSlot(slotKey)
    const popup = reserveExternalShareWindow('Preparing batch share...')
    try {
      const res = await apiFetch(`/api/v1/leads/${lead.id}/batch-share-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slotKey }),
      })
      if (!res.ok) throw new Error(await readResponseError(res))
      const body = (await res.json()) as { watch_url_v1?: string; watch_url_v2?: string }
      const waUrl = workboardBatchWhatsAppUrl(lead, dayKey, slot, { v1: body.watch_url_v1, v2: body.watch_url_v2 })
      if (!waUrl) throw new Error('Phone number missing for WhatsApp batch share.')
      if (!completeExternalShareWindow(popup, waUrl)) throw new Error('Could not open WhatsApp share window.')
      await pm.mutateAsync({ id: lead.id, body: { [slotKey]: true } })
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (err) {
      closeExternalShareWindow(popup)
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
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not update batch state')
    } finally {
      setToggleSlot(null)
    }
  }


  // day2: issue the prospect's single cheat-proof business-test link → WhatsApp
  const handleSendTestLink = async () => {
    setBatchError(null)
    setTestLinkBusy(true)
    const popup = reserveExternalShareWindow('Preparing test link...')
    try {
      const res = await apiFetch(`/api/v1/leads/${lead.id}/day2-test-link`, { method: 'POST' })
      if (!res.ok) throw new Error(await readResponseError(res))
      const body = (await res.json()) as { test_url?: string }
      const waUrl = buildDay2BusinessTestWhatsAppUrl({
        leadName: lead.name,
        phone: lead.phone,
        testUrl: body.test_url,
      })
      if (!waUrl) throw new Error('Phone number missing for WhatsApp test share.')
      if (!completeExternalShareWindow(popup, waUrl)) throw new Error('Could not open WhatsApp share window.')
      await qc.refetchQueries({ queryKey: ['workboard'] })
    } catch (err) {
      closeExternalShareWindow(popup)
      setBatchError(err instanceof Error ? err.message : 'Could not generate test link')
    } finally {
      setTestLinkBusy(false)
    }
  }

  if (!hasBatchSlots) {
    // day3 closing sub-flow: interview → 2CC → blueprint → stage → seat-hold → converted
    const day3Done = stageChecklistComplete(lead, 'day3')
    return (
      <div className="space-y-1.5">
        <ProcessChecklistSection
          lead={lead}
          stage={stageKey}
          pm={pm}
          leadPatchBusy={leadPatchBusy}
          taskKeys={['day3_interview', 'day3_2cc_plan', 'day3_blueprint_video']}
        />
        <Day3StagePicker lead={lead} pm={pm} leadPatchBusy={leadPatchBusy} />
        <Day3StagePayment lead={lead} leadPatchBusy={leadPatchBusy} />
        {onMoveNext ? (
          <button
            type="button"
            disabled={leadPatchBusy || !day3Done}
            onClick={onMoveNext}
            className="w-full rounded-md border border-green-500/40 bg-green-500/10 px-2 py-1 text-ds-caption font-semibold text-green-300 transition hover:bg-green-500/20 disabled:opacity-50"
          >
            {nextLabel ?? 'Mark Converted'}
          </button>
        ) : null}
      </div>
    )
  }

  const slotTimeLabels = (['M', 'A', 'E'] as const)

  // day1 + day2: send tokenized batch links (M/A/E) — mirrors old app's 3 batch
  // buttons. Day 2 also carries the business-test link. (No expose/follow-up/id
  // checklist — old app had none.)
  if (hasBatchSlots) {
    return (
      <div className="space-y-1.5">
        <div className="space-y-1.5 border-t border-border/40 pt-1.5">
          <div className="flex items-center gap-2">
            <span className="text-ds-caption text-muted-foreground">Links:</span>
            {batchSlots.map((slotKey, i) => {
              const slot = (slotTimeLabels as readonly string[])[i] as 'M' | 'A' | 'E' | '6PM' | '8PM'
              const timeLabel = slotTimeLabels[i]
              const slotDone = lead[slotKey]
              const busy = sharingSlot === slotKey
              return (
                <button key={`share-${slotKey}`} type="button"
                  disabled={leadPatchBusy || busy}
                  onClick={() => void handleBatchShare(slot, slotKey)}
                  className={cn(
                    'flex h-6 min-w-10 items-center justify-center rounded px-1.5 text-ds-caption font-semibold transition disabled:opacity-50',
                    slotDone
                      ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                      : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary',
                  )}>
                  {busy ? '...' : timeLabel}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ds-caption text-muted-foreground">Check:</span>
            {batchSlots.map((slotKey, i) => {
              const slotDone = lead[slotKey]
              const busy = toggleSlot === slotKey
              return (
                <button key={`toggle-${slotKey}`} type="button"
                  disabled={leadPatchBusy || busy}
                  aria-label={slotDone ? `Uncheck ${slotTimeLabels[i]}` : `Check ${slotTimeLabels[i]}`}
                  onClick={() => void handleBatchToggle(slotKey)}
                  className={cn(
                    'flex h-6 min-w-10 items-center justify-center rounded px-1.5 text-ds-caption font-semibold transition disabled:opacity-50',
                    slotDone
                      ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                      : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary',
                  )}>
                  {busy ? '...' : slotDone ? <CheckSquare className="h-3 w-3" /> : <span>{slotTimeLabels[i]}</span>}
                </button>
              )
            })}
          </div>
          {batchError ? <p className="text-ds-caption text-destructive">{batchError}</p> : null}
        </div>
        {stageKey === 'day2' ? (
          allSlotsDone ? (
            <Day2TestLinkRow lead={lead} busy={testLinkBusy} onSend={() => void handleSendTestLink()} />
          ) : (
            <p className="border-t border-border/40 pt-1.5 text-ds-caption text-muted-foreground">
              Complete all 3 Day 2 batches to unlock the business test.
            </p>
          )
        ) : null}
        {allSlotsDone && onMoveNext && (
          <button type="button" disabled={leadPatchBusy} onClick={onMoveNext}
            className="w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
            {nextLabel ?? 'Move to next stage →'}
          </button>
        )}
      </div>
    )
  }

  // day3 closing sub-flow renders via the ProcessChecklistSection early-return above.
  return null
}

function LeadCardItem({ lead, stageKey, nextStatus, pm, patchBusyLeadId, mindsetBusyLeadId, mindsetPreviewByLeadId, onRequestMindsetSend, nextLabel, nowMs, showClosingActions }: {
  lead: LeadPublic; stageKey?: WorkboardStageKey; nextStatus?: LeadStatus
  pm: PM; patchBusyLeadId: number | null; mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
  nextLabel?: string; nowMs: number; showClosingActions?: boolean
}) {
  const _moveNext = useCallback(
    () => { if (nextStatus) void pm.mutateAsync({ id: lead.id, body: { status: nextStatus } }) },
    [nextStatus, pm, lead.id],
  )
  const onMoveNext = stageKey && nextStatus ? _moveNext : undefined
  return (
    <LeadCard
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
      showClosingActions={showClosingActions}
    />
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
  showClosingActions,
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
  showClosingActions?: boolean
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
      {leads.map((lead) => (
        <LeadCardItem
          key={lead.id}
          lead={lead}
          stageKey={stageKey}
          nextStatus={nextStatus}
          pm={pm}
          patchBusyLeadId={patchBusyLeadId}
          mindsetBusyLeadId={mindsetBusyLeadId}
          mindsetPreviewByLeadId={mindsetPreviewByLeadId}
          onRequestMindsetSend={onRequestMindsetSend}
          nextLabel={nextLabel}
          nowMs={nowMs}
          showClosingActions={showClosingActions}
        />
      ))}
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
  showClosingActions,
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
  showClosingActions?: boolean
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
      showClosingActions={showClosingActions}
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
  queueRole: 'team' | 'leader' | 'admin'
  currentUserId: number | null
}) {
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const allowLead = (lead: LeadPublic) =>
    queueRole === 'admin' || queueRole !== 'leader' || (currentUserId != null && lead.assigned_to_user_id === currentUserId)
  const day1Leads = (byS.day1?.items ?? []).filter(
    (l) =>
      allowLead(l) &&
      !l.mindset_started_at &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)),
  )
  const mindsetLeads = (byS.mindset_lock?.items ?? []).filter(
    (l) =>
      allowLead(l) &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)),
  )
  const mindsetQueue = [...day1Leads, ...mindsetLeads]
  useEffect(() => {
    mindsetLeads.forEach((lead) => {
      const ready =
        lead.status === 'mindset_lock' &&
        lead.mindset_lock_state !== 'leader_assigned'
      if (!ready) return
      if (Object.prototype.hasOwnProperty.call(mindsetPreviewByLeadId, lead.id)) return
      ensureMindsetPreview(lead)
    })
  }, [mindsetLeads, mindsetPreviewByLeadId, ensureMindsetPreview])

  if (queueRole === 'admin') {
    const grouped = mindsetQueue.reduce<Record<string, LeadPublic[]>>((acc, lead) => {
      const ownerKey = lead.owner_name ?? `User #${lead.owner_user_id ?? '?'}`
      ;(acc[ownerKey] ??= []).push(lead)
      return acc
    }, {})
    const entries = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))
    return (
      <div id="mindset-lock" className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Mindset Lock — All Team</h2>
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-ds-caption font-semibold tabular-nums text-muted-foreground">
            {mindsetQueue.length}
          </span>
        </div>
        {mindsetQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mindset-lock leads across team.</p>
        ) : (
          entries.map(([ownerName, leads]) => (
            <div key={ownerName} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{ownerName}</h3>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-ds-caption font-semibold tabular-nums text-muted-foreground">
                  {leads.length}
                </span>
              </div>
              <Grid
                leads={leads}
                pm={pm}
                patchBusyLeadId={patchBusyLeadId}
                mindsetBusyLeadId={mindsetBusyLeadId}
                mindsetPreviewByLeadId={mindsetPreviewByLeadId}
                onRequestMindsetSend={onRequestMindsetSend}
                empty=""
                nowMs={nowMs}
              />
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div id="mindset-lock" className="space-y-3">
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
            ? 'No personal mindset-lock leads yet'
            : 'No mindset-lock leads yet'
        }
        nowMs={nowMs}
      />
    </div>
  )
}


// ── AdminView ──────────────────────────────────────────────────────────────────
function AdminView({ cols, pm, patchBusyLeadId, search, nowMs, allowStageAdvance = true, tab, onTabChange }: {
  cols: Col[]
  pm: PM
  patchBusyLeadId: number | null
  search: string
  nowMs: number
  allowStageAdvance?: boolean
  tab: ATab
  onTabChange: (tab: ATab) => void
}) {
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
    <div id="pipeline" className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={(id) => onTabChange(id as ATab)}/>
      {active?.id === 'day2' ? (
        <div className="space-y-3">
          {/* Day 3 summary chips */}
          <div className="flex flex-wrap gap-2">
            {[['Complete', day2.filter((l) => !!l.day2_completed_at).length, 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25'],
              ['In Progress', day2.filter((l) => !l.day2_completed_at && !!l.day1_completed_at).length, 'bg-amber-400/15 text-amber-300 border-amber-400/25'],
              ['Not Started', day2.filter((l) => !l.day1_completed_at).length, 'bg-muted/30 text-muted-foreground border-white/10'],
            ].map(([label, count, cls]) =>
              <span key={label as string} className={cn('rounded-full border px-2.5 py-0.5 text-ds-caption font-medium', cls as string)}>{label}: {count}</span>)}
          </div>
          <Grid
            leads={day2}
            stageKey="day2"
            nextStatus={allowStageAdvance ? 'day3' : undefined}
            nextLabel={allowStageAdvance ? 'Push to Day 3' : undefined}
            pm={pm}
            patchBusyLeadId={patchBusyLeadId}
            nowMs={nowMs}
          />
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
                <Grid leads={items} pm={pm} patchBusyLeadId={patchBusyLeadId} empty="No leads" nowMs={nowMs} showClosingActions />
              </div>
            )
          })}
        </div>
      ) : active?.stageKey ? (
        <Grid
          leads={active.items}
          stageKey={active.stageKey}
          nextStatus={allowStageAdvance ? active.nextStatus : undefined}
          nextLabel={allowStageAdvance ? active.nextLabel : undefined}
          pm={pm}
          patchBusyLeadId={patchBusyLeadId}
          nowMs={nowMs}
        />
      ) : null}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function WorkboardPage({ title, mode = 'pipeline' }: Props) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
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
  const adminTab = parseAdminTab(searchParams.get('tab'))
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

  const setAdminTab = useCallback((tab: ATab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'day2') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

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
      setToastMsg('Mindset Lock complete. Lead moved to Day 2')
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
          <button type="button" onClick={() => navigate(-1)} className="mb-1 text-sm text-primary underline-offset-2 hover:underline">← Back</button>
          <h1 className="text-ds-h2">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mode === 'mindset-lock'
              ? surfaceRole === 'admin'
                ? 'All team mindset-lock leads — grouped by member.'
                : surfaceRole === 'leader'
                ? 'Your assigned leads ready for mindset lock — complete before Day 2.'
                : 'Complete mindset lock for your leads before they move to Day 2.'
              : surfaceRole === 'admin'
                ? 'Organization pipeline — Day 2 onwards.'
                : 'Day 2 onwards execution pipeline.'}
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
            aria-label="Search leads"
            className="field-input w-full pl-9 pr-3"/>
        </div>
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-32 rounded"/>)}
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
        mode === 'mindset-lock'
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
              queueRole={surfaceRole === 'admin' ? 'admin' : surfaceRole === 'leader' ? 'leader' : 'team'}
              currentUserId={currentUserId}
            />
          )
          : (
            <AdminView
              cols={cols}
              pm={pm}
              patchBusyLeadId={patchBusyLeadId}
              search={search}
              nowMs={nowMs}
              allowStageAdvance={surfaceRole !== 'team'}
              tab={adminTab}
              onTabChange={setAdminTab}
            />
          )
      )}
      {confirmLead ? (
        <div className="keyboard-safe-modal fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="keyboard-safe-sheet w-full max-w-md overflow-y-auto rounded border border-border bg-card p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
              {surfaceRole === 'leader' ? 'Complete Mindset Lock?' : 'Send to Leader?'}
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {surfaceRole === 'leader' ? (
                <>
                  <li>You have completed the After Day 1 checklist and mindset call</li>
                  <li>This action will complete Mindset Lock and move the lead into your Day 2 queue</li>
                  <li>You can continue execution from the Day 2 tab</li>
                </>
              ) : (
                <>
                  <li>You have completed the After Day 1 checklist and mindset call</li>
                  <li>This action will complete Mindset Lock and move the lead to Day 2 under your leader</li>
                  <li>You won't be able to edit after this</li>
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
                  ? surfaceRole === 'leader'
                    ? 'Starting…'
                    : 'Sending…'
                  : surfaceRole === 'leader'
                    ? 'Confirm & Start Day 2'
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
