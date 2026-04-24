import type { Role } from '@/types/role'
import type { LeadStatus } from '@/hooks/use-leads-query'

/** API `call_status` slugs allowed by `LeadUpdate` — labels mirror legacy dial-outcome copy. */
export const CALL_STATUS_API_VALUES = [
  'not_called',
  'no_answer',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
  'video_sent',
  'video_watched',
  'payment_done',
  'converted',
] as const

export type CallStatusApi = (typeof CALL_STATUS_API_VALUES)[number]

const LABEL: Record<CallStatusApi, string> = {
  not_called: 'Not Called Yet',
  no_answer: 'Called - No Answer',
  interested: 'Called - Interested',
  not_interested: 'Called - Not Interested',
  follow_up: 'Called - Follow Up',
  called: 'Called - Busy',
  callback_requested: 'Call Back',
  video_sent: 'Sent Enroll Video',
  video_watched: 'Video Watched',
  payment_done: 'Payment Done',
  converted: 'Already / Converted',
}

/** Legacy `TEAM_CALL_STATUS_VALUES` — dial/line only (subset of API). */
const TEAM_ORDER: CallStatusApi[] = [
  'not_called',
  'no_answer',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
]

const BASE_ORDER: CallStatusApi[] = [
  'not_called',
  'no_answer',
  'interested',
  'not_interested',
  'follow_up',
  'called',
  'callback_requested',
]

const VIDEO_SENT_STAGES = new Set<LeadStatus>([
  'video_sent',
  'video_watched',
  'paid',
  'mindset_lock',
  'day1',
  'day2',
  'day3',
  'interview',
  'track_selected',
  'seat_hold',
  'converted',
])

const VIDEO_WATCHED_STAGES = new Set<LeadStatus>([
  'video_watched',
  'paid',
  'mindset_lock',
  'day1',
  'day2',
  'day3',
  'interview',
  'track_selected',
  'seat_hold',
  'converted',
])

const PAYMENT_DONE_STAGES = new Set<LeadStatus>([
  'paid',
  'mindset_lock',
  'day1',
  'day2',
  'day3',
  'interview',
  'track_selected',
  'seat_hold',
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
  if (VIDEO_WATCHED_STAGES.has(status)) visible.add('video_watched')
  if (PAYMENT_DONE_STAGES.has(status)) visible.add('payment_done')
  if (status === 'converted') visible.add('converted')

  return CALL_STATUS_API_VALUES
    .filter((value) => visible.has(value))
    .map((value) => ({ value, label: LABEL[value] }))
}
