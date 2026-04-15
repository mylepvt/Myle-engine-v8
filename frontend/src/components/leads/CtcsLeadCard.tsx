import { useEffect, useState } from 'react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { cn } from '@/lib/utils'
import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'
import type { CtcsAction, LeadPublic, LeadStatus } from '@/hooks/use-leads-query'

type Pill =
  | { kind: 'patch'; label: string; status: LeadStatus }
  | { kind: 'action'; label: string; action: CtcsAction }

const STATUS_PILLS: Pill[] = [
  { kind: 'patch', label: 'New', status: 'new_lead' },
  { kind: 'patch', label: 'Contacted', status: 'contacted' },
  { kind: 'action', label: 'Interested', action: 'interested' },
  { kind: 'action', label: 'Call Later', action: 'call_later' },
  { kind: 'action', label: 'Paid', action: 'paid' },
  { kind: 'action', label: 'Not Interested', action: 'not_interested' },
]

function pillActive(l: LeadPublic, pill: Pill): boolean {
  if (pill.kind === 'patch') {
    if (pill.status === 'new_lead') return l.status === 'new_lead' || l.status === 'new'
    return l.status === pill.status
  }
  if (pill.action === 'interested') {
    return ['invited', 'video_sent', 'video_watched'].includes(l.status)
  }
  if (pill.action === 'paid') {
    return ['paid', 'day1', 'day2', 'interview', 'track_selected', 'seat_hold', 'converted'].includes(l.status)
  }
  if (pill.action === 'call_later') {
    return Boolean(l.next_followup_at) && l.status === 'contacted'
  }
  if (pill.action === 'not_interested') {
    return l.status === 'lost' || l.status === 'inactive'
  }
  return false
}

type Props = {
  lead: LeadPublic
  isActive: boolean
  patchBusy: boolean
  actionBusy: boolean
  onPatchStatus: (id: number, status: LeadStatus) => void
  onCtcsAction: (id: number, action: CtcsAction, opts?: { followupAt?: string | null }) => void
  onCall: (lead: LeadPublic) => void
  onFollowUp: (id: number) => void
}

export function CtcsLeadCard({
  lead,
  isActive,
  patchBusy,
  actionBusy,
  onPatchStatus,
  onCtcsAction,
  onCall,
  onFollowUp,
}: Props) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const busy = patchBusy || actionBusy
  const ms = timerRemainingMs(lead.last_action_at ?? null, lead.created_at)
  const overdue = ms < 0
  void tick

  const lastLabel = lead.last_action_at
    ? new Date(lead.last_action_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : '—'

  return (
    <article
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-sm transition',
        isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{lead.name}</h3>
          <p className="text-sm text-muted-foreground">{lead.city?.trim() || '—'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LeadContactActions phone={lead.phone} size="md" stopPropagation />
          <button
            type="button"
            disabled={busy || !lead.phone?.trim()}
            onClick={() => onCall(lead)}
            className="min-h-12 min-w-[7.5rem] rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Call
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_PILLS.map((pill) => {
          const active = pillActive(lead, pill)
          return (
            <button
              key={pill.kind === 'patch' ? pill.status : pill.action}
              type="button"
              disabled={busy}
              onClick={() =>
                pill.kind === 'patch'
                  ? onPatchStatus(lead.id, pill.status)
                  : onCtcsAction(lead.id, pill.action)
              }
              className={cn(
                'min-h-11 rounded-full border px-3 text-sm font-medium transition',
                active
                  ? 'border-primary bg-primary/20 text-foreground'
                  : 'border-white/15 bg-white/[0.06] text-muted-foreground hover:border-primary/35',
              )}
            >
              {pill.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-xs text-muted-foreground">24h timer</div>
          <div className={cn('font-mono text-base font-medium', overdue ? 'text-red-400' : 'text-foreground')}>
            {formatCountdown(ms)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-xs text-muted-foreground">Heat</div>
          <div className="text-base font-semibold text-orange-300">{lead.heat_score ?? 0}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 sm:col-span-2">
          <div className="text-xs text-muted-foreground">Last action</div>
          <div className="text-foreground">{lastLabel}</div>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onFollowUp(lead.id)}
          className="w-full min-h-12 rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm font-medium text-amber-100 hover:bg-amber-500/20"
        >
          Follow-up +24h
        </button>
      </div>
    </article>
  )
}
