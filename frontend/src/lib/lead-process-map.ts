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
  day1: {
    status: 'day1',
    title: 'Day 1',
    helper: 'Day 1 live session — leader. Run the session, follow up, build hype for Day 2.',
    nextStatus: 'day2',
    nextLabel: 'Push to Day 2',
    tasks: [
      { key: 'day1_live_session', label: 'Day 1 Live Session' },
      { key: 'day1_follow_up', label: 'Follow-up' },
      { key: 'hype_create_day2', label: 'Hype Create for Day 2' },
    ],
  },
  day2: {
    status: 'day2',
    title: 'Day 2',
    helper: 'Day 2 live session — admin advances. Share expose video, follow up, confirm ID creation.',
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
    helper: 'Closing environment — leader. Interview → 2CC paper plan → Blueprint video → Stage selection (1/2/3) → seat-hold → converted.',
    nextStatus: 'converted',
    nextLabel: 'Mark Converted',
    tasks: [
      { key: 'day3_interview', label: 'Interview' },
      { key: 'day3_2cc_plan', label: '2CC Paper Plan' },
      { key: 'day3_blueprint_video', label: 'Blueprint Video', kind: 'share_video' },
      { key: 'day3_stage_selection', label: 'Stage Selection (1 / 2 / 3)' },
      { key: 'day3_seat_hold', label: 'Seat-Hold' },
    ],
  },
}

export const PROCESS_STAGE_ORDER = [
  'day1',
  'day2',
  'day3',
] as const

export function checklistForStage(status: string): ProcessStageDef | null {
  return PROCESS_STAGE_DEFS[status] ?? null
}
