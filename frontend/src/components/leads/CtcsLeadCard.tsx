import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, MessageCircle, MoreHorizontal, Phone, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { callStatusSelectOptions, type CallStatusApi } from '@/lib/call-status-options'
import { currentSectionForLead, nextSectionForLead } from '@/lib/lead-section'
import { formatLeadSlaTime, leadSlaClockAngles, leadSlaTone } from '@/lib/lead-sla'
import { leadStatusSelectOptionsForLead, teamMayChangeLeadStatus } from '@/lib/team-lead-status'
import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import { telHref, whatsAppChatHref } from '@/lib/phone-links'
import { LEAD_STATUS_OPTIONS, type LeadPublic, type LeadStatus } from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'

const ASSIGNEE_PALETTE = ['bg-blue-500', 'bg-pink-500', 'bg-violet-500', 'bg-cyan-500', 'bg-amber-500'] as const

/** Native `<select>` — compact so Call + Lead sit one row beside Dial/WA. */
const pillSelectInner =
  'max-w-[min(9.5rem,34vw)] min-w-0 h-full flex-1 cursor-pointer appearance-none rounded-full border-0 bg-transparent py-0 pl-0.5 pr-5 text-left text-ds-caption font-medium leading-none text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 disabled:opacity-40'

function statusDotClass(status: string): string {
  if (status === 'contacted') return 'bg-yellow-500'
  if (status === 'lost' || status === 'inactive') return 'bg-gray-500'
  if (status === 'new_lead' || status === 'new') return 'bg-sky-400'
  if (['paid', 'day1', 'day2'].includes(status)) return 'bg-emerald-400'
  return 'bg-orange-400'
}

function normalizeCallStatus(raw: string | null | undefined): CallStatusApi {
  const s = (raw ?? '').trim()
  if (!s) return 'not_called'
  const allowed = new Set(callStatusSelectOptions('admin').map((o) => o.value))
  return (allowed.has(s as CallStatusApi) ? s : 'not_called') as CallStatusApi
}

function initialsFromName(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw) return 'A'
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

type Props = {
  lead: LeadPublic
  nowMs: number
  isActive: boolean
  patchBusy: boolean
  actionBusy: boolean
  onPatchStatus: (id: number, status: LeadStatus) => void
  onPatchCallStatus: (id: number, callStatus: string) => void
  onCall: (lead: LeadPublic) => void
  onFollowUp: (id: number) => void
}

export function CtcsLeadCard({
  lead,
  nowMs,
  isActive,
  patchBusy,
  actionBusy,
  onPatchStatus,
  onPatchCallStatus,
  onCall,
  onFollowUp,
}: Props) {
  const { role, serverRole } = useDashboardShellRole()
  const selectBusy = patchBusy || actionBusy

  // ── Proof upload ───────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const qc = useQueryClient()

  const proofApproved = lead.payment_status === 'approved'
  const proofPending = lead.payment_status === 'proof_uploaded' || uploadDone
  const proofRejected = lead.payment_status === 'rejected'
  const showProofControl = lead.status === 'video_watched' || proofPending || proofApproved || proofRejected
  const currentRole = resolveDashboardSurfaceRole(role, serverRole) ?? 'team'
  const mayUploadProof = (currentRole === 'leader' || currentRole === 'team') && (lead.status === 'video_watched' || proofRejected)

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

  const ms = timerRemainingMs(lead.last_action_at ?? null, lead.created_at, nowMs)
  const overdue = ms < 0
  const remainingSec = Math.max(0, Math.floor(ms / 1000))
  const colorKey = overdue ? 0 : remainingSec
  const timeColors = leadSlaTone(colorKey)
  const { hourAngle, minuteAngle, secondAngle } = leadSlaClockAngles(overdue ? 0 : ms)

  const wa = whatsAppChatHref(lead.phone ?? '')
  const tel = telHref(lead.phone)
  const canDial = tel !== '#'
  /** Dial / WhatsApp stay usable while CTCS runs; only this card’s patch blocks. */
  const dialBlocked = patchBusy || !canDial
  const phoneRaw = lead.phone?.trim() ?? ''
  const cityRaw = lead.city?.trim() ?? ''
  const phoneLine = phoneRaw || null
  const cityLine = cityRaw || null

  const assigneeBg =
    lead.assigned_to_user_id != null
      ? ASSIGNEE_PALETTE[Math.abs(lead.assigned_to_user_id) % ASSIGNEE_PALETTE.length]
      : null
  const assigneeName = (lead.assigned_to_name ?? '').trim() || 'Assigned'
  const assigneeInitials = initialsFromName(lead.assigned_to_name)

  const pipelineReadonly = currentRole === 'team' && !teamMayChangeLeadStatus(lead.status as LeadStatus)
  const statusOptions = leadStatusSelectOptionsForLead(currentRole, lead.status as LeadStatus, LEAD_STATUS_OPTIONS)
  const callOpts = callStatusSelectOptions(currentRole, lead.status as LeadStatus)
  const callVal = normalizeCallStatus(lead.call_status)
  const currentSection = currentSectionForLead(lead, currentRole)
  const nextSection = nextSectionForLead(lead, currentRole)
  const timerEndingSoon = overdue || remainingSec <= 2 * 60 * 60
  const showCurrentSectionHint =
    lead.archived_at != null || currentSection.path !== '/dashboard/work/leads'
  const showNextSectionHint = timerEndingSoon && nextSection != null

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-2.5 text-card-foreground backdrop-blur-md',
        'bg-card/90 dark:bg-card/80 supports-[backdrop-filter]:bg-card/75 supports-[backdrop-filter]:dark:bg-card/60',
        timeColors.border,
        timeColors.cardGlow,
        isActive && 'ring-2 ring-cyan-500/90 ring-offset-2 ring-offset-background dark:ring-[var(--palette-cyan-dull)]',
      )}
    >
      <div
        className={cn('absolute bottom-2 left-0 top-2 w-[3px] rounded-full', timeColors.leftBorder)}
        aria-hidden
      />

      <div className="relative pl-2.5">
        <div className="mb-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-foreground">
              {lead.name}
            </h3>
            {assigneeBg ? (
              <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5">
                <div
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[9px] font-medium text-primary-foreground',
                    assigneeBg,
                  )}
                >
                  {assigneeInitials}
                </div>
                <span className="max-w-[7.5rem] truncate text-ds-caption text-muted-foreground" title={assigneeName}>
                  {assigneeName}
                </span>
              </div>
            ) : null}
          </div>
          {phoneLine || cityLine ? (
            <p className="mt-0.5 text-ds-caption leading-tight text-muted-foreground">
              {phoneLine ? <span className="font-mono">{phoneLine}</span> : null}
              {phoneLine && cityLine ? <span className="text-muted-foreground/70"> · </span> : null}
              {cityLine ? <span>{cityLine}</span> : null}
            </p>
          ) : null}
        </div>

        {/* Keep call + lead status compact on one row. */}
        <div
          className={cn(
            'mb-1.5 flex min-h-[2.25rem] items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'rounded-lg border border-border/40 bg-muted/20 px-1 py-1',
          )}
        >
          {pipelineReadonly ? (
            <div className="flex h-8 min-w-[6.5rem] max-w-[38%] shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 px-2.5">
              <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(lead.status))} aria-hidden />
              <span className="truncate text-ds-caption text-foreground">
                {LEAD_STATUS_OPTIONS.find((o) => o.value === lead.status)?.label ?? lead.status}
              </span>
              <span className="text-ds-caption text-muted-foreground">·</span>
              <span className="text-ds-caption text-muted-foreground">Leader</span>
            </div>
          ) : (
            <div className="relative flex h-8 min-w-[7rem] max-w-[40%] shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 pl-2 pr-6">
              <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(lead.status))} aria-hidden />
              <select
                className={pillSelectInner}
                disabled={selectBusy}
                value={lead.status}
                title="Lead status"
                aria-label="Lead status"
                onChange={(e) => onPatchStatus(lead.id, e.target.value as LeadStatus)}
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronRight
                className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
            </div>
          )}
          <div className="relative flex h-8 min-w-[7.25rem] max-w-[40%] shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 pl-2 pr-6">
            <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <select
              className={pillSelectInner}
              disabled={selectBusy}
              value={callVal}
              title={currentRole === 'team' ? 'Call / line — dial outcome' : 'Call classification'}
              aria-label="Call status"
              onChange={(e) => onPatchCallStatus(lead.id, e.target.value)}
            >
              {callOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronRight
              className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          </div>

        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className={cn('relative size-8 shrink-0 rounded-full', timeColors.glow)}>
            <svg viewBox="0 0 40 40" className="size-full" aria-hidden>
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="transparent"
                stroke={timeColors.stroke}
                strokeWidth="2"
                strokeOpacity="0.5"
              />
              <line
                x1="20"
                y1="20"
                x2="20"
                y2="10"
                stroke={timeColors.stroke}
                strokeWidth="2"
                strokeLinecap="round"
                transform={`rotate(${hourAngle}, 20, 20)`}
              />
              <line
                x1="20"
                y1="20"
                x2="20"
                y2="7"
                stroke={timeColors.stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                transform={`rotate(${minuteAngle}, 20, 20)`}
              />
              <line
                x1="20"
                y1="20"
                x2="20"
                y2="5"
                stroke={timeColors.stroke}
                strokeWidth="1"
                strokeLinecap="round"
                transform={`rotate(${secondAngle}, 20, 20)`}
              />
              <circle cx="20" cy="20" r="2" fill={timeColors.stroke} />
            </svg>
            </div>
            <div>
              <p className={cn('text-ds-caption font-semibold leading-tight', timeColors.text)}>
                {overdue ? formatCountdown(ms) : formatLeadSlaTime(remainingSec)}
              </p>
              <p className="text-ds-caption text-muted-foreground">{overdue ? 'SLA' : 'remaining'}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!dialBlocked ? (
              <a
                href={tel}
                onClick={() => {
                  void onCall(lead)
                }}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 transition active:scale-95',
                  'border-emerald-600/50 bg-emerald-500/15 text-emerald-900',
                  'shadow-[0_0_10px_rgba(52,211,153,0.35)] ring-1 ring-emerald-500/25',
                  'hover:border-emerald-500 hover:bg-emerald-500/25',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600/80',
                  'dark:border-emerald-400/70 dark:bg-emerald-500/20 dark:text-emerald-100 dark:shadow-[0_0_12px_rgba(52,211,153,0.45)] dark:ring-emerald-400/30',
                  'dark:hover:border-emerald-300 dark:hover:bg-emerald-500/30',
                )}
                title="Dial — log + outcome"
                aria-label="Dial and log call"
              >
                <Phone className="size-3.5 text-emerald-800 dark:text-emerald-200" aria-hidden />
              </a>
            ) : (
              <span
                className="flex size-8 cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted/50 opacity-40"
                title="No phone"
              >
                <Phone className="size-3.5 text-muted-foreground" aria-hidden />
              </span>
            )}
            {wa !== '#' ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 transition active:scale-95',
                  'border-[#128C7E]/60 bg-[#25D366]/15 text-[#065f46]',
                  'shadow-[0_0_10px_rgba(37,211,102,0.28)] ring-1 ring-[#25D366]/25 hover:bg-[#25D366]/25',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E]/70',
                  'dark:border-[#25D366]/75 dark:bg-[#25D366]/20 dark:text-[#dcf8c6] dark:shadow-[0_0_12px_rgba(37,211,102,0.45)] dark:ring-[#25D366]/35',
                  'dark:hover:border-[#34eb75] dark:hover:bg-[#25D366]/30',
                )}
                title="WhatsApp"
                aria-label="Open WhatsApp chat"
              >
                <MessageCircle className="size-3.5 text-[#047857] dark:text-[#b8f5c4]" aria-hidden />
              </a>
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full border border-border bg-muted/40 opacity-40">
                <MessageCircle className="size-3.5 text-muted-foreground" aria-hidden />
              </span>
            )}
            <button
              type="button"
              disabled={selectBusy}
              onClick={() => onFollowUp(lead.id)}
              className="flex size-8 items-center justify-center rounded-full border border-border bg-muted/70 text-muted-foreground transition hover:bg-muted active:scale-95 disabled:opacity-40"
              title="Follow-up +24h"
              aria-label="Schedule follow-up"
            >
              <MoreHorizontal className="size-3" aria-hidden />
            </button>
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
                <span
                  title="Proof approved"
                  className="flex size-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/12 text-emerald-300"
                >
                  <CheckCircle2 className="size-3.5" />
                </span>
              ) : proofPending ? (
                <span
                  title="Proof pending review"
                  className="flex size-8 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/12 text-sky-300"
                >
                  <CheckCircle2 className="size-3.5" />
                </span>
              ) : mayUploadProof ? (
                <button
                  type="button"
                  title={uploading ? 'Uploading…' : uploadError ? `Retry — ${uploadError}` : 'Upload ₹196 proof'}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border transition disabled:opacity-50 active:scale-95',
                    uploadError
                      ? 'border-red-400/40 bg-muted/30 text-red-400 hover:bg-red-400/10'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-amber-400/40 hover:text-amber-400',
                  )}
                >
                  <Upload className="size-3.5" />
                </button>
              ) : null
            ) : null}
          </div>
        </div>

        {showCurrentSectionHint || showNextSectionHint ? (
          <div className="mt-1.5 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-ds-caption">
            {showCurrentSectionHint ? (
              <p className="text-muted-foreground">
                Find now:{' '}
                <Link
                  to={currentSection.path}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {currentSection.label}
                </Link>
              </p>
            ) : null}
            {showNextSectionHint ? (
              <p className="text-muted-foreground">
                Timer ending:{' '}
                <Link
                  to={nextSection.path}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {nextSection.label}
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
