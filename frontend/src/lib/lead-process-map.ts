import type { LeadStatus } from '@/hooks/use-leads-query'

export type ProcessTaskKind = 'check' | 'share_video' | 'open_video' | 'whatsapp_video'

export type ProcessTaskDef = {
  key: string
  label: string
  kind?: ProcessTaskKind
  /** AppSetting key for video URL — used by open_video kind */
  settingKey?: string
}

export type ProcessStageDef = {
  status: LeadStatus
  title: string
  helper: string
  nextStatus?: LeadStatus
  nextLabel?: string
  tasks: ProcessTaskDef[]
}

export const PROCESS_STAGE_DEFS: Record<string, ProcessStageDef> = {
  mindset_lock: {
    status: 'mindset_lock',
    title: 'Mindset Lock',
    helper: 'Bridge between Calling Board Day 1 and Workboard Day 2. Team completes these tasks here before leader handoff.',
    nextStatus: 'day2',
    nextLabel: 'Push to Day 2',
    tasks: [
      { key: 'esbi_model_session', label: 'ESBI Model', kind: 'whatsapp_video', settingKey: 'content.esbi_model' },
      { key: 'esbi_follow_up', label: 'Follow-up' },
      { key: 'power_of_network_session', label: 'Power of Network', kind: 'whatsapp_video', settingKey: 'content.power_of_network' },
      { key: 'power_of_network_follow_up', label: 'Follow-up' },
      { key: 'hype_create_day2_leader', label: 'Hype Create for Day 2 + Leader' },
    ],
  },
  day2: {
    status: 'day2',
    title: 'Day 2',
    helper: 'Send Day 2 live session link, share expose video, follow up, confirm ID creation.',
    nextStatus: 'day3',
    nextLabel: 'Push to Day 3',
    tasks: [
      { key: 'manik_aggarwal_expose_video', label: 'Expose Video', kind: 'share_video', settingKey: 'content.manik_expose' },
      { key: 'day2_follow_up', label: 'Follow-up' },
      { key: 'id_create', label: 'ID Create' },
    ],
  },
  day3: {
    status: 'day3',
    title: 'Day 3',
    helper: 'Morning → testimony → follow-up → 3rd party → closing mindset → send live session → Min. FLP billing.',
    nextStatus: 'day4',
    nextLabel: 'Push to Day 4',
    tasks: [
      { key: 'testimony_videos', label: 'Testimony Videos' },
      { key: 'morning_follow_up', label: 'Follow-up' },
      { key: 'third_party_session', label: '3rd Party' },
      { key: 'closing_environment_build_up', label: 'Closing Environment Build-up' },
    ],
  },
  day4: {
    status: 'day4',
    title: 'Day 4',
    helper: 'Morning → Afternoon → Evening batch videos. All 3 batches done to push to Day 5.',
    nextStatus: 'day5',
    nextLabel: 'Push to Day 5',
    tasks: [
      { key: 'batch_morning', label: 'Morning Batch Video', kind: 'share_video' },
      { key: 'batch_afternoon', label: 'Afternoon Batch Video', kind: 'share_video' },
      { key: 'batch_evening', label: 'Evening Batch Video', kind: 'share_video' },
    ],
  },
  day5: {
    status: 'day5',
    title: 'Day 5',
    helper: 'Morning → Afternoon → Evening batch videos. All 3 batches done to push to Day 6.',
    nextStatus: 'interview',
    nextLabel: 'Push to Day 6',
    tasks: [
      { key: 'batch_morning', label: 'Morning Batch Video', kind: 'share_video' },
      { key: 'batch_afternoon', label: 'Afternoon Batch Video', kind: 'share_video' },
      { key: 'batch_evening', label: 'Evening Batch Video', kind: 'share_video' },
    ],
  },
  interview: {
    status: 'interview',
    title: 'Day 6 Closing',
    helper: 'Interview → 2CC live session → final closing (₹5000 or 2CC). Cumulative with Day 3 billing. Close or move to Lost.',
    nextStatus: 'converted',
    nextLabel: 'Mark Converted',
    tasks: [
      { key: 'day6_interview', label: 'Interview' },
      { key: 'day6_2cc_plan', label: '2CC Live Session' },
      { key: 'closing_5000_or_2cc', label: 'Final Closing (₹5000 / 2CC)' },
      { key: 'follow_up_closing', label: 'Follow-up Closing' },
    ],
  },
}

export const PROCESS_STAGE_ORDER = [
  'day2',
  'day3',
  'day4',
  'day5',
  'interview',
] as const

export function checklistForStage(status: string): ProcessStageDef | null {
  return PROCESS_STAGE_DEFS[status] ?? null
}
