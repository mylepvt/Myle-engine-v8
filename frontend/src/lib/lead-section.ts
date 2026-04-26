import type { LeadPublic } from '@/hooks/use-leads-query'
import type { Role } from '@/types/role'

export type LeadSectionInfo = {
  label: string
  path: string
}

const NEXT_STATUS_BY_STATUS: Partial<Record<string, string>> = {
  new_lead: 'invited',
  contacted: 'invited',
  invited: 'video_sent',
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
  lost: 'retarget',
  inactive: 'retarget',
}

function inboxLabel(role: Role | null): string {
  return role === 'admin' ? 'All Leads' : 'Calling Board'
}

function workboardTabPath(tab: string): string {
  return `/dashboard/work/workboard?tab=${tab}#pipeline`
}

function sectionForStatus(status: string, role: Role | null): LeadSectionInfo {
  if (status === 'retarget' || status === 'lost' || status === 'inactive') {
    return { label: 'Retarget', path: '/dashboard/work/retarget' }
  }
  if (status === 'paid' || status === 'mindset_lock') {
    return { label: 'Workboard -> Mindset Lock', path: '/dashboard/work/workboard#mindset-lock' }
  }
  if (status === 'day1') {
    return { label: 'Workboard -> Day 1', path: workboardTabPath('day1') }
  }
  if (status === 'day2') {
    return { label: 'Workboard -> Day 2', path: workboardTabPath('day2') }
  }
  if (status === 'day3') {
    return { label: 'Workboard -> Day 3', path: workboardTabPath('day3') }
  }
  if (status === 'interview') {
    return { label: 'Workboard -> Interview', path: workboardTabPath('interview') }
  }
  if (status === 'track_selected') {
    return { label: 'Workboard -> Track', path: workboardTabPath('track_selected') }
  }
  if (status === 'seat_hold') {
    return { label: 'Workboard -> Seat Hold', path: workboardTabPath('seat_hold') }
  }
  if (status === 'converted') {
    return { label: 'Workboard -> Closing', path: workboardTabPath('closing') }
  }
  return { label: inboxLabel(role), path: '/dashboard/work/leads' }
}

export function currentSectionForLead(
  lead: Pick<LeadPublic, 'status' | 'archived_at'>,
  role: Role | null,
): LeadSectionInfo {
  if (lead.archived_at) {
    return { label: 'Archived Leads', path: '/dashboard/work/archived' }
  }
  return sectionForStatus(lead.status, role)
}

export function nextSectionForLead(
  lead: Pick<LeadPublic, 'status' | 'archived_at'>,
  role: Role | null,
): LeadSectionInfo | null {
  if (lead.archived_at) return null
  const nextStatus = NEXT_STATUS_BY_STATUS[lead.status]
  if (!nextStatus) return null
  const current = currentSectionForLead(lead, role)
  const next = sectionForStatus(nextStatus, role)
  return next.label === current.label ? null : next
}
