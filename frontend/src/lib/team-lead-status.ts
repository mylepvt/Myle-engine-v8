import { LEGACY_COMPAT_STATUSES, USER_OUTCOME_STATUSES, type LeadStatus } from '@/hooks/use-leads-query'

/** Mirrors `TEAM_FORBIDDEN_STATUS_SLUGS` in `backend/app/core/lead_status.py`. */
const TEAM_FORBIDDEN: ReadonlySet<LeadStatus> = new Set([
  'day1',
  'day2',
  'day3',
  'converted',
  'training',
])

const NON_ADMIN_HIDDEN: ReadonlySet<LeadStatus> = new Set(LEGACY_COMPAT_STATUSES)
const DIRECT_PICK_HIDDEN: ReadonlySet<LeadStatus> = new Set<LeadStatus>([])

/** Forward-advance ordering — mirrors `LEAD_STATUS_SEQUENCE` in backend `lead_status.py`. */
const STATUS_RANK: Partial<Record<LeadStatus, number>> = {
  new_lead: 0,
  contacted: 1,
  invited: 2,
  video_sent: 3,
  video_watched: 4,
  day1: 5,
  day2: 6,
  day3: 7,
  converted: 8,
}

/**
 * Stages only an admin may ADVANCE a lead INTO (forward). Mirrors backend
 * `DAY_ADVANCE_ALLOWED_ROLES` — day3 entry is admin-only; leader may still
 * step backward into day3 (e.g. converted → day3) as a correction.
 */
const ADMIN_ONLY_FORWARD_ENTRY: ReadonlySet<LeadStatus> = new Set<LeadStatus>(['day3'])

function isForwardMove(from: LeadStatus, to: LeadStatus): boolean {
  const a = STATUS_RANK[from]
  const b = STATUS_RANK[to]
  if (a === undefined || b === undefined) return false
  return b > a
}


const TEAM_STAGE_VISIBILITY: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new_lead: ['new_lead', 'contacted', 'invited'],
  contacted: ['contacted', 'invited', 'video_sent'],
  invited: ['invited', 'video_sent'],
  video_sent: ['video_sent', 'video_watched'],
  video_watched: ['video_watched'],
  lost: ['lost', 'retarget', 'inactive'],
  retarget: ['retarget', 'contacted', 'invited'],
  inactive: ['inactive', 'retarget'],
}

export function teamMayChangeLeadStatus(status: LeadStatus): boolean {
  return !TEAM_FORBIDDEN.has(status)
}

/** Options for the pipeline `<select>` (team cannot pick leader-only stages). */
export function teamLeadStatusSelectOptions(
  role: 'admin' | 'leader' | 'team' | null,
  all: { value: LeadStatus; label: string }[],
): { value: LeadStatus; label: string }[] {
  const withoutDirectHidden = all.filter((o) => !DIRECT_PICK_HIDDEN.has(o.value))
  if (role === 'admin') return withoutDirectHidden
  if (role === 'leader') return withoutDirectHidden.filter((o) => !NON_ADMIN_HIDDEN.has(o.value))
  if (role === 'team') {
    return withoutDirectHidden.filter((o) => !TEAM_FORBIDDEN.has(o.value) && !NON_ADMIN_HIDDEN.has(o.value))
  }
  return withoutDirectHidden.filter((o) => !NON_ADMIN_HIDDEN.has(o.value))
}

export function leadStatusSelectOptionsForLead(
  role: 'admin' | 'leader' | 'team' | null,
  currentStatus: LeadStatus,
  all: { value: LeadStatus; label: string }[],
): { value: LeadStatus; label: string }[] {
  const roleFiltered = teamLeadStatusSelectOptions(role, all)
  if (role === 'admin') return roleFiltered
  if (role === 'leader') {
    // Leader cannot ADVANCE a lead forward into an admin-only entry stage (day3),
    // but may still pick it as a backward correction or keep the current value.
    const gated = roleFiltered.filter(
      (o) =>
        o.value === currentStatus ||
        !ADMIN_ONLY_FORWARD_ENTRY.has(o.value) ||
        !isForwardMove(currentStatus, o.value),
    )
    const currentOption = all.find((o) => o.value === currentStatus)
    if (currentOption && !gated.some((o) => o.value === currentStatus)) {
      return [currentOption, ...gated]
    }
    return gated
  }

  const stageMap = TEAM_STAGE_VISIBILITY
  const visible = new Set<LeadStatus>(stageMap[currentStatus] ?? [currentStatus])
  visible.add(currentStatus)
  USER_OUTCOME_STATUSES.forEach((status) => visible.add(status))

  const currentOption = all.find((option) => option.value === currentStatus)
  const scoped = [
    ...(currentOption && !roleFiltered.some((option) => option.value === currentStatus) ? [currentOption] : []),
    ...roleFiltered.filter((option) => visible.has(option.value)),
  ]
  return scoped.length > 0 ? scoped : roleFiltered
}
