import { LEGACY_COMPAT_STATUSES, USER_OUTCOME_STATUSES, type LeadStatus } from '@/hooks/use-leads-query'

/** Mirrors `TEAM_FORBIDDEN_STATUS_SLUGS` in `backend/app/core/lead_status.py`. */
const TEAM_FORBIDDEN: ReadonlySet<LeadStatus> = new Set([
  'day2',
  'day3',
  'day4',
  'day5',
  'interview',
  'converted',
  'training',
  'pending',
])

const NON_ADMIN_HIDDEN: ReadonlySet<LeadStatus> = new Set(LEGACY_COMPAT_STATUSES)
const DIRECT_PICK_HIDDEN: ReadonlySet<LeadStatus> = new Set(['whatsapp_sent'])


const TEAM_STAGE_VISIBILITY: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new_lead: ['new_lead', 'contacted', 'invited'],
  contacted: ['contacted', 'invited', 'video_sent'],
  invited: ['invited', 'video_sent'],
  whatsapp_sent: ['whatsapp_sent', 'video_sent'],
  video_sent: ['video_sent', 'mindset_lock'],
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
  if (role === 'leader') {
    const currentOption = all.find((o) => o.value === currentStatus)
    if (currentOption && !roleFiltered.some((o) => o.value === currentStatus)) {
      return [currentOption, ...roleFiltered]
    }
    return roleFiltered
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
