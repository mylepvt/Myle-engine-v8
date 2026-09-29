import { Link } from 'react-router-dom'
import { ChevronRight, MessageCircle, MoreHorizontal, Phone, UserRoundCog } from 'lucide-react'

import { cn } from '@/lib/utils'
import { RegisterLinkButton } from '@/components/leads/RegisterLinkButton'
import { SendToDay1Button } from '@/components/leads/SendToDay1Button'
import { callStatusSelectOptions, type CallStatusApi } from '@/lib/call-status-options'
import { currentSectionForLead, nextSectionForLead } from '@/lib/lead-section'
import { formatLeadSlaTime, leadSlaClockAngles, leadSlaTone } from '@/lib/lead-sla'
import { leadStatusSelectOptionsForLead, teamMayChangeLeadStatus } from '@/lib/team-lead-status'
import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import { telHref, whatsAppChatHref } from '@/lib/phone-links'
import {
  ENROLLMENT_SENDABLE_STATUSES,
  LEAD_STATUS_OPTIONS,
  type LeadPublic,
  type LeadStatus,
} from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'

const ASSIGNEE_PALETTE = ['bg-blue-500', 'bg-pink-500', 'bg-violet-500', 'bg-cyan-500', 'bg-amber-500'] as const

/** Pill wrapper for a status dropdown; the visible text is a truncating label. */
const pillShell =
  'relative flex h-9 min-w-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 pl-2.5 pr-6 focus-within:ring-2 focus-within:ring-primary/50'

/**
 * The real `<select>` sits invisibly over the whole pill: tapping anywhere opens the
 * native picker, while the visible label truncates cleanly with "…". Global dashboard
 * `select` styles (grey fill, 16px font) never show, so Android + iOS look identical.
 */
const pillSelectOverlay =
  'absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed'

const pillLabel = 'min-w-0 flex-1 truncate text-ds-caption font-medium leading-none text-foreground'

function statusDotClass(status: string): string {
  if (status === 'contacted') return 'bg-yellow-500'
  if (status === 'lost' || status === 'inactive') return 'bg-gray-500'
  if (status === 'new_lead' || status === 'new') return 'bg-sky-400'
  if (['day1', 'day2'].includes(status)) return 'bg-emerald-400'
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
  onReassign?: (lead: LeadPublic) => void
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
  onReassign,
}: Props) {
  const { role, serverRole } = useDashboardShellRole()
  const selectBusy = patchBusy || actionBusy
  const currentRole = resolveDashboardSurfaceRole(role, serverRole) ?? 'team'

  const ms = timerRemainingMs(lead.last_action_at ?? null, lead.created_at, nowMs)
  const overdue = ms < 0
  const remainingSec = Math.max(0, Math.floor(ms / 1000))
  const colorKey = overdue ? 0 : remainingSec
  const timeColors = leadSlaTone(colorKey)
  const { hourAngle, minuteAngle, secondAngle } = leadSlaClockAngles(overdue ? 0 : ms)

  const wa = whatsAppChatHref(lead.phone ?? '')
  const tel = telHref(lead.phone)
  const canDial = tel !== '#'
  /** Dial / WhatsApp stay usable while CTCS runs; only this card's patch blocks. */
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
  const statusLabel =
    statusOptions.find((o) => o.value === lead.status)?.label ??
    LEAD_STATUS_OPTIONS.find((o) => o.value === lead.status)?.label ??
    lead.status
  const callLabel = callOpts.find((o) => o.value === callVal)?.label ?? callVal
  const currentSection = currentSectionForLead(lead, currentRole)
  const nextSection = nextSectionForLead(lead, currentRole)
  const timerEndingSoon = overdue || remainingSec <= 2 * 60 * 60
  const showCurrentSectionHint =
    lead.archived_at != null || currentSection.path !== '/dashboard/work/leads'
  const showNextSectionHint = timerEndingSoon && nextSection != null
  const showSendToDay1 = currentRole !== 'admin' && ENROLLMENT_SENDABLE_STATUSES.includes(lead.status)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded border p-2.5 text-card-foreground backdrop-blur-md',
        'bg-card dark:bg-card/80 supports-[backdrop-filter]:dark:bg-card/60',
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
                    'flex size-5 items-center justify-center rounded-full text-ds-micro font-medium text-primary-foreground',
                    assigneeBg,
                  )}
                >
                  {assigneeInitials}
                </div>
                <span className="max-w-[5.5rem] truncate text-ds-caption text-muted-foreground min-[380px]:max-w-[7.5rem]" title={assigneeName}>
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
          {lead.is_reassigned ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-ds-micro font-semibold uppercase tracking-wide text-orange-500">
              <UserRoundCog className="size-3" aria-hidden />
              Reassigned
            </span>
          ) : null}
        </div>

        {/* Lead status + call status: two equal halves, never clipped. */}
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-lg border border-border/40 bg-muted/20 p-1">
          {pipelineReadonly ? (
            <div className="flex h-9 min-w-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 px-2.5">
              <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(lead.status))} aria-hidden />
              <span className="truncate text-ds-caption text-foreground">
                {LEAD_STATUS_OPTIONS.find((o) => o.value === lead.status)?.label ?? lead.status}
              </span>
              <span className="hidden shrink-0 text-ds-caption text-muted-foreground min-[380px]:inline">· Leader</span>
            </div>
          ) : (
            <div className={cn(pillShell, selectBusy && 'opacity-50')}>
              <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(lead.status))} aria-hidden />
              <span className={pillLabel}>{statusLabel}</span>
              <select
                className={pillSelectOverlay}
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
          <div className={cn(pillShell, selectBusy && 'opacity-50')}>
            <Phone className="hidden size-3.5 shrink-0 text-muted-foreground min-[380px]:block" aria-hidden />
            <span className={pillLabel}>{callLabel}</span>
            <select
              className={pillSelectOverlay}
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

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex shrink-0 items-center gap-1.5">
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
            <div className="whitespace-nowrap">
              <p className={cn('text-ds-caption font-semibold tabular-nums leading-tight', timeColors.text)}>
                {overdue ? formatCountdown(ms) : formatLeadSlaTime(remainingSec)}
              </p>
              <p className="text-ds-micro leading-tight text-muted-foreground">{overdue ? 'SLA over' : 'left'}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 min-[380px]:gap-1.5">
            {!dialBlocked ? (
              <a
                href={tel}
                onClick={() => {
                  void onCall(lead)
                }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 transition active:scale-95 min-[380px]:size-10',
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
                className="flex size-9 min-[380px]:size-10 cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted/50 opacity-40"
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
                  'flex size-9 items-center justify-center rounded-full border-2 transition active:scale-95 min-[380px]:size-10',
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
              <span className="flex size-9 min-[380px]:size-10 items-center justify-center rounded-full border border-border bg-muted/40 opacity-40">
                <MessageCircle className="size-3.5 text-muted-foreground" aria-hidden />
              </span>
            )}
            <button
              type="button"
              disabled={selectBusy}
              onClick={() => onFollowUp(lead.id)}
              className="flex size-9 min-[380px]:size-10 items-center justify-center rounded-full border border-border bg-muted/70 text-muted-foreground transition hover:bg-muted active:scale-95 disabled:opacity-40"
              title="Follow-up +24h"
              aria-label="Schedule follow-up"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
            {onReassign ? (
              <button
                type="button"
                disabled={selectBusy}
                onClick={() => onReassign(lead)}
                className="flex size-9 min-[380px]:size-10 items-center justify-center rounded-full border border-border bg-muted/70 text-muted-foreground transition hover:border-primary/40 hover:text-foreground active:scale-95 disabled:opacity-40"
                title="Reassign to top performer"
                aria-label="Reassign lead"
              >
                <UserRoundCog className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {/* Primary next step gets its own full-width row — easy to tap, never crowds the icons. */}
        {showSendToDay1 || lead.status === 'converted' ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {showSendToDay1 ? <SendToDay1Button lead={lead} className="h-10 w-full justify-center text-sm" /> : null}
            {lead.status === 'converted' ? (
              <RegisterLinkButton lead={lead} className="h-10 w-full justify-center text-sm" />
            ) : null}
          </div>
        ) : null}

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
