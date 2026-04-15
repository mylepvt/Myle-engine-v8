import type { LeadStatus } from '@/hooks/use-leads-query'

/** Mirrors `TEAM_FORBIDDEN_STATUS_SLUGS` in `backend/app/core/lead_status.py`. */
const TEAM_FORBIDDEN: ReadonlySet<LeadStatus> = new Set([
  'day1',
  'day2',
  'interview',
  'track_selected',
  'seat_hold',
  'converted',
  'level_up',
  'training',
  'pending',
  'plan_2cc',
])

export function teamMayChangeLeadStatus(status: LeadStatus): boolean {
  return !TEAM_FORBIDDEN.has(status)
}

/** Options for the pipeline `<select>` (team cannot pick leader-only stages). */
export function teamLeadStatusSelectOptions(
  role: 'admin' | 'leader' | 'team' | null,
  all: { value: LeadStatus; label: string }[],
): { value: LeadStatus; label: string }[] {
  if (role !== 'team') return all
  return all.filter((o) => !TEAM_FORBIDDEN.has(o.value))
}
