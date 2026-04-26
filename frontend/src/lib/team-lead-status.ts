import { LEGACY_COMPAT_STATUSES, USER_OUTCOME_STATUSES, type LeadStatus } from '@/hooks/use-leads-query'

/** Mirrors `TEAM_FORBIDDEN_STATUS_SLUGS` in `backend/app/core/lead_status.py`. */
const TEAM_FORBIDDEN: ReadonlySet<LeadStatus> = new Set([
  'day1',
  'day2',
  'day3',
  'interview',
  'track_selected',
  'seat_hold',
  'converted',
  'level_up',
  'training',
  'pending',
  'plan_2cc',
])

const NON_ADMIN_HIDDEN: ReadonlySet<LeadStatus> = new Set(LEGACY_COMPAT_STATUSES)
const DIRECT_PICK_HIDDEN: ReadonlySet<LeadStatus> = new Set(['whatsapp_sent'])

const LEADER_STAGE_VISIBILITY: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new_lead: ['new_lead', 'contacted', 'invited'],
  contacted: ['contacted', 'invited', 'video_sent'],
  invited: ['invited', 'video_sent'],
  whatsapp_sent: ['whatsapp_sent', 'video_sent', 'video_watched'],
  video_sent: ['video_sent', 'video_watched', 'paid'],
  video_watched: ['video_watched', 'paid', 'mindset_lock'],
  paid: ['paid', 'mindset_lock', 'day1'],
  mindset_lock: ['mindset_lock', 'day1'],
  day1: ['day1', 'day2'],
  day2: ['day2', 'day3', 'interview'],
  day3: ['day3', 'interview', 'track_selected'],
  interview: ['interview', 'track_selected', 'seat_hold'],
  track_selected: ['track_selected', 'seat_hold', 'converted'],
  seat_hold: ['seat_hold', 'converted'],
  converted: ['converted'],
  lost: ['lost', 'retarget', 'inactive'],
  retarget: ['retarget', 'contacted', 'invited'],
  inactive: ['inactive', 'retarget'],
}

const TEAM_STAGE_VISIBILITY: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new_lead: ['new_lead', 'contacted', 'invited'],
  contacted: ['contacted', 'invited', 'video_sent'],
  invited: ['invited', 'video_sent'],
  whatsapp_sent: ['whatsapp_sent', 'video_sent', 'video_watched'],
  video_sent: ['video_sent', 'video_watched'],
  video_watched: ['video_watched', 'paid'],
  paid: ['paid', 'mindset_lock'],
  mindset_lock: ['mindset_lock'],
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

  const stageMap = role === 'team' ? TEAM_STAGE_VISIBILITY : LEADER_STAGE_VISIBILITY
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
