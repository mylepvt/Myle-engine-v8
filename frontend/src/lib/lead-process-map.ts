import type { LeadStatus } from '@/hooks/use-leads-query'

export type ProcessTaskKind = 'check' | 'share_video' | 'open_video'

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
      { key: 'esbi_model_session', label: 'ESBI Model', kind: 'open_video', settingKey: 'content.esbi_model' },
      { key: 'esbi_follow_up', label: 'Follow-up' },
      { key: 'power_of_network_session', label: 'Power of Network', kind: 'open_video', settingKey: 'content.power_of_network' },
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
      { key: 'manik_aggarwal_expose_video', label: 'Expose Video', kind: 'share_video' },
      { key: 'day2_follow_up', label: 'Follow-up' },
      { key: 'id_create', label: 'ID Create' },
    ],
  },
  day3: {
    status: 'day3',
    title: 'Before Day 3',
    helper: 'Morning warm-up and hype sequence before the Day 3 close.',
    nextStatus: 'interview',
    nextLabel: 'Push to Day 3 Closing',
    tasks: [
      { key: 'testimony_videos', label: 'Testimony Videos' },
      { key: 'morning_follow_up', label: 'Follow-up' },
      { key: 'third_party_hype', label: '3rd Party Hype' },
      { key: 'third_party_session', label: '3rd Party Session' },
      { key: 'closing_environment_build_up', label: 'Closing Environment Build-up' },
    ],
  },
  interview: {
    status: 'interview',
    title: 'Day 3 Closing',
    helper: 'Leader closes the Day 3 conversion push and records the immediate closing follow-up.',
    nextStatus: 'track_selected',
    nextLabel: 'Push to Day 4',
    tasks: [
      { key: 'closing_1500', label: '₹1500 Closing' },
      { key: 'follow_up_closing', label: 'Follow-up Closing' },
    ],
  },
  track_selected: {
    status: 'track_selected',
    title: 'Day 4',
    helper: 'Three Day-4 sessions are tracked in sequence with follow-up checkpoints.',
    nextStatus: 'seat_hold',
    nextLabel: 'Push to Day 5',
    tasks: [
      { key: 'secret_industry_reveal', label: 'Secret Industry Reveal' },
      { key: 'police_testimony', label: 'Police Testimony' },
      { key: 'day4_session1_follow_up', label: 'Session 1 Follow-up' },
      { key: 'calculation_of_life', label: 'Calculation of Life' },
      { key: 'marketing_plan', label: 'Marketing Plan' },
      { key: 'day4_session2_follow_up', label: 'Session 2 Follow-up' },
      { key: 'navjot_maam_video', label: "Navjot Ma'am Video" },
      { key: 'product_session', label: 'Product Session' },
      { key: 'day4_session3_follow_up', label: 'Session 3 Follow-up' },
    ],
  },
  seat_hold: {
    status: 'seat_hold',
    title: 'Day 5',
    helper: 'Track all three Day-5 sessions and their follow-ups before moving into Day 6.',
    nextStatus: 'plan_2cc',
    nextLabel: 'Push to Day 6',
    tasks: [
      { key: 'vishakha_job_vs_business', label: "Vishakha Ma'am Job vs Business" },
      { key: 'asli_sach', label: 'Asli Sach' },
      { key: 'day5_session1_follow_up', label: 'Session 1 Follow-up' },
      { key: 'why_not_flp', label: 'Why Not FLP' },
      { key: 'day5_session2_follow_up', label: 'Session 2 Follow-up' },
      { key: 'virtual_success_day', label: 'Virtual Success Day' },
      { key: 'manpreet_video', label: 'Manpreet Video' },
      { key: 'day5_session3_follow_up', label: 'Session 3 Follow-up' },
    ],
  },
  plan_2cc: {
    status: 'plan_2cc',
    title: 'Day 6',
    helper: 'Leader records the Day-6 interview, 2CC plan, and closing push in one place.',
    nextStatus: 'pending',
    nextLabel: 'Push to Pending Process',
    tasks: [
      { key: 'day6_interview', label: 'Interview' },
      { key: 'day6_2cc_plan', label: '2CC Plan' },
      { key: 'day6_closing', label: 'Closing' },
    ],
  },
  pending: {
    status: 'pending',
    title: 'Pending Process',
    helper: 'Next 3 days of leader-led follow-up sessions before the final close.',
    nextStatus: 'level_up',
    nextLabel: 'Push to Final Stage',
    tasks: [
      { key: 'abhishek_utane', label: 'Abhishek Utane' },
      { key: 'abhishek_follow_up', label: 'Follow-up' },
      { key: 'vishakha_maam', label: "Vishakha Ma'am" },
      { key: 'vishakha_follow_up', label: 'Follow-up' },
      { key: 'azhar_sir', label: 'Azhar Sir' },
      { key: 'azhar_follow_up', label: 'Follow-up' },
      { key: 'md_imran', label: 'MD Imran' },
      { key: 'md_imran_follow_up', label: 'Follow-up' },
    ],
  },
  level_up: {
    status: 'level_up',
    title: 'Final Stage',
    helper: 'Admin and leader finish the level-up close and final 2CC / 5000 close here.',
    nextStatus: 'converted',
    nextLabel: 'Mark Converted',
    tasks: [
      { key: 'level_up_closing', label: 'Level Up Closing' },
      { key: 'closing_5000_or_2cc', label: '₹5000 / 2CC Closing' },
    ],
  },
}

export const PROCESS_STAGE_ORDER = [
  'day2',
  'day3',
  'interview',
  'track_selected',
  'seat_hold',
  'plan_2cc',
  'pending',
  'level_up',
] as const

export function checklistForStage(status: string): ProcessStageDef | null {
  return PROCESS_STAGE_DEFS[status] ?? null
}
