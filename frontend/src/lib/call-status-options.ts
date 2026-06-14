import type { Role } from '@/types/role'
import type { LeadStatus } from '@/hooks/use-leads-query'

/** API `call_status` slugs allowed by `LeadUpdate` — labels mirror legacy dial-outcome copy. */
export const CALL_STATUS_API_VALUES = [
  'not_called',
  'call_received',
  'no_answer',
  'call_cut',
  'person_block',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
  'video_sent',
  'converted',
] as const

export type CallStatusApi = (typeof CALL_STATUS_API_VALUES)[number]

const LABEL: Record<CallStatusApi, string> = {
  not_called: 'Not Called Yet',
  call_received: 'Call Received',
  no_answer: 'No Response',
  call_cut: 'Call Cut',
  person_block: 'Person Block',
  interested: 'Called - Interested',
  not_interested: 'Called - Not Interested',
  follow_up: 'Called - Follow Up',
  called: 'Called - Busy',
  callback_requested: 'Call Back',
  video_sent: 'Sent Day 1 Video',
  converted: 'Already / Converted',
}

/** Dial/line outcomes — what physically happened on the call. */
const TEAM_ORDER: CallStatusApi[] = [
  'not_called',
  'call_received',
  'no_answer',
  'call_cut',
  'person_block',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
]

const BASE_ORDER: CallStatusApi[] = [
  'not_called',
  'call_received',
  'no_answer',
  'call_cut',
  'person_block',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
]

const VIDEO_SENT_STAGES = new Set<LeadStatus>([
  'video_sent',
  'video_watched',
  'day1',
  'day2',
  'day3',
  'converted',
])

export function callStatusSelectOptions(
  role: Role | null,
  currentStatus?: LeadStatus | string | null,
): { value: CallStatusApi; label: string }[] {
  if (role === 'team') {
    return TEAM_ORDER.map((value) => ({ value, label: LABEL[value] }))
  }

  const status = (currentStatus ?? '').trim() as LeadStatus
  if (!status) {
    return CALL_STATUS_API_VALUES.map((value) => ({ value, label: LABEL[value] }))
  }

  const visible = new Set<CallStatusApi>(BASE_ORDER)
  if (VIDEO_SENT_STAGES.has(status)) visible.add('video_sent')
  if (status === 'converted') visible.add('converted')

  return CALL_STATUS_API_VALUES
    .filter((value) => visible.has(value))
    .map((value) => ({ value, label: LABEL[value] }))
}
