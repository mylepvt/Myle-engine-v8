import type { Role } from '@/types/role'

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
  video_sent: 'Video Sent',
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

export function callStatusSelectOptions(role: Role | null): { value: CallStatusApi; label: string }[] {
  const full = CALL_STATUS_API_VALUES.map((value) => ({ value, label: LABEL[value] }))
  if (role === 'team') {
    return TEAM_ORDER.map((value) => ({ value, label: LABEL[value] }))
  }
  return full
}

