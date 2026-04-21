import type { CtcsAction, LeadPublic } from '@/hooks/use-leads-query'

function clampHeat(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export type CtcsOptimisticOpts = {
  followupAt?: string | null
  /** Paid action: team stays on ``paid``; leader/admin advance to ``day1``. */
  paidStatus?: 'paid' | 'day1'
}

function stageAnchorForStatusChange(lead: LeadPublic, nextStatus: LeadPublic['status'], now: string): string | null | undefined {
  return nextStatus === lead.status ? lead.last_action_at ?? null : now
}

/** Best-effort client mirror of CTCS action for instant list updates (reconciled on server response). */
export function applyCtcsOptimisticToLead(
  lead: LeadPublic,
  action: CtcsAction,
  opts?: CtcsOptimisticOpts,
): LeadPublic {
  const now = new Date().toISOString()
  const h = lead.heat_score ?? 0
  switch (action) {
    case 'interested':
      return {
        ...lead,
        status: 'video_sent',
        call_status: 'video_sent',
        heat_score: clampHeat(h + 20),
        last_action_at: stageAnchorForStatusChange(lead, 'video_sent', now),
        whatsapp_sent_at: now,
      }
    case 'not_picked': {
      const next = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      return {
        ...lead,
        status: 'contacted',
        next_followup_at: next,
        heat_score: clampHeat(h + 10 - 5),
        last_action_at: stageAnchorForStatusChange(lead, 'contacted', now),
        call_status: 'no_answer',
      }
    }
    case 'call_later': {
      const fu = opts?.followupAt
      const next =
        fu && fu.trim() !== ''
          ? fu
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      return {
        ...lead,
        status: 'contacted',
        next_followup_at: next,
        heat_score: clampHeat(h + 10),
        last_action_at: stageAnchorForStatusChange(lead, 'contacted', now),
      }
    }
    case 'not_interested':
      return {
        ...lead,
        status: 'lost',
        heat_score: 0,
        last_action_at: stageAnchorForStatusChange(lead, 'lost', now),
        archived_at: now,
        is_archived: true,
        in_pool: false,
      }
    case 'paid': {
      const slug = opts?.paidStatus === 'paid' ? 'paid' : 'day1'
      return {
        ...lead,
        status: slug,
        payment_status: 'approved',
        heat_score: clampHeat(h + 25),
        last_action_at: stageAnchorForStatusChange(lead, slug, now),
      }
    }
    default:
      return lead
  }
}
