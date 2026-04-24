import { LEAD_STATUS_OPTIONS, PRIMARY_USER_FLOW_STATUSES, USER_OUTCOME_STATUSES } from '@/hooks/use-leads-query'

/** Preferred primary action order — mirrors the real team journey instead of legacy compat stages. */
export const LEAD_PIPELINE_ORDER: readonly string[] = [
  ...PRIMARY_USER_FLOW_STATUSES,
  ...USER_OUTCOME_STATUSES,
]

const PRIMARY_NEXT_BY_STATUS: Record<string, string> = {
  new_lead: 'invited',
  contacted: 'invited',
  invited: 'whatsapp_sent',
  whatsapp_sent: 'video_sent',
  video_sent: 'video_watched',
  video_watched: 'paid',
  paid: 'mindset_lock',
  mindset_lock: 'day1',
  day1: 'day2',
  day2: 'day3',
  day3: 'interview',
  interview: 'track_selected',
  track_selected: 'seat_hold',
  seat_hold: 'converted',
}

const VISIBLE_ALTERNATIVE_TARGETS = new Set<string>([
  ...PRIMARY_USER_FLOW_STATUSES,
  ...USER_OUTCOME_STATUSES,
])

function orderIndex(slug: string): number {
  const i = LEAD_PIPELINE_ORDER.indexOf(slug)
  return i >= 0 ? i : 9999
}

/**
 * Pick a single primary “forward” transition for one-tap UX.
 * Prefers the smallest step ahead in pipeline order; if none, falls back to first API option.
 */
export function pickPrimaryNextTransition(currentSlug: string, availableTargets: string[]): string | null {
  if (!availableTargets.length) return null
  const preferred = PRIMARY_NEXT_BY_STATUS[currentSlug]
  if (preferred && availableTargets.includes(preferred)) {
    return preferred
  }
  const cur = orderIndex(currentSlug)
  const forwards = availableTargets.filter((t) => orderIndex(t) > cur)
  if (forwards.length) {
    return forwards.sort((a, b) => orderIndex(a) - orderIndex(b))[0] ?? null
  }
  return availableTargets[0] ?? null
}

export function visibleAlternativeTransitions(currentSlug: string, availableTargets: string[]): string[] {
  const preferred = PRIMARY_NEXT_BY_STATUS[currentSlug]
  return availableTargets.filter((target) => {
    if (target === currentSlug || !VISIBLE_ALTERNATIVE_TARGETS.has(target)) return false
    if (preferred && target === preferred) return true
    return USER_OUTCOME_STATUSES.includes(target as (typeof USER_OUTCOME_STATUSES)[number])
  })
}

function statusLabel(slug: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === slug)?.label ?? slug.replace(/_/g, ' ')
}

/** Short verb for the primary button — mirrors legacy flow intent. */
export function primaryActionLabel(targetSlug: string): string {
  const verbs: Record<string, string> = {
    new_lead: 'Set to New lead',
    contacted: 'Mark contacted',
    invited: 'Mark invited',
    whatsapp_sent: 'Mark WhatsApp sent',
    video_sent: 'Send video (WhatsApp) → mark sent',
    video_watched: 'Mark video watched',
    paid: 'Mark paid ₹196',
    mindset_lock: 'Start mindset lock',
    day1: 'Move to Day 1',
    day2: 'Move to Day 2',
    day3: 'Move to Day 3',
    interview: 'Move to Interview',
    track_selected: 'Mark track selected',
    seat_hold: 'Mark seat hold',
    converted: 'Mark converted',
    lost: 'Mark lost',
    retarget: 'Move to Retarget',
    inactive: 'Mark inactive',
    training: 'Move to Training',
    plan_2cc: 'Move to 2CC plan',
    level_up: 'Level up',
    pending: 'Mark pending',
    new: 'Set legacy New',
  }
  return verbs[targetSlug] ?? `Go to ${statusLabel(targetSlug)}`
}

/** Open WhatsApp with a short video message — only meaningful when moving to `video_sent`. */
export function buildWhatsAppVideoUrl(phone: string | null | undefined, leadName: string): string | null {
  if (!phone?.trim()) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  const n = leadName.trim() || 'there'
  const text = `Hi ${n}, watch this 15-min video — link below.\n[your enrollment link]`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function shouldOfferWhatsAppForTransition(
  _currentSlug: string,
  targetSlug: string,
): boolean {
  return targetSlug === 'video_sent'
}
