import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'

/** Same order as backend `LEAD_STATUS_SEQUENCE` — forward “next” picks lowest index &gt; current. */
export const LEAD_PIPELINE_ORDER: readonly string[] = [
  'new_lead',
  'contacted',
  'invited',
  'video_sent',
  'video_watched',
  'paid',
  'day1',
  'day2',
  'interview',
  'track_selected',
  'seat_hold',
  'converted',
  'lost',
  'retarget',
  'inactive',
  'training',
  'plan_2cc',
  'level_up',
  'pending',
  'new',
]

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
  const cur = orderIndex(currentSlug)
  const forwards = availableTargets.filter((t) => orderIndex(t) > cur)
  if (forwards.length) {
    return forwards.sort((a, b) => orderIndex(a) - orderIndex(b))[0] ?? null
  }
  return availableTargets[0] ?? null
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
    video_sent: 'Send video (WhatsApp) → mark sent',
    video_watched: 'Mark video watched',
    paid: 'Mark paid ₹196',
    day1: 'Move to Day 1',
    day2: 'Move to Day 2',
    interview: 'Move to Interview',
    track_selected: 'Track selected',
    seat_hold: 'Seat hold',
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
