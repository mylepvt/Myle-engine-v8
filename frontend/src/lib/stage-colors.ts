/**
 * One colour per lead-journey phase, shared by every stage badge, pipeline bar
 * and board. Colours come from the `--stage-*` tokens in index.css, so light
 * and dark themes stay readable without per-component `dark:` pairs.
 */
export type StagePhase = 'early' | 'engaged' | 'closing' | 'won' | 'lost' | 'parked'

const PHASE_BY_STATUS: Record<string, StagePhase> = {
  new: 'early',
  new_lead: 'early',
  contacted: 'early',
  invited: 'early',
  whatsapp_sent: 'engaged',
  video_sent: 'engaged',
  video_watched: 'engaged',
  paid: 'engaged',
  day1: 'engaged',
  day2: 'closing',
  day3: 'closing',
  day4: 'closing',
  day5: 'closing',
  interview: 'closing',
  training: 'closing',
  converted: 'won',
  lost: 'lost',
  dead: 'lost',
  retarget: 'parked',
  inactive: 'parked',
}

/** Written out in full so Tailwind's scanner sees every class. */
const BADGE_BY_PHASE: Record<StagePhase, string> = {
  early: 'border-stage-early/25 bg-stage-early/10 text-stage-early-ink',
  engaged: 'border-stage-engaged/25 bg-stage-engaged/10 text-stage-engaged-ink',
  closing: 'border-stage-closing/25 bg-stage-closing/10 text-stage-closing-ink',
  won: 'border-stage-won/25 bg-stage-won/10 text-stage-won-ink',
  lost: 'border-stage-lost/25 bg-stage-lost/10 text-stage-lost-ink',
  parked: 'border-stage-parked/25 bg-stage-parked/10 text-stage-parked-ink',
}

export function stagePhase(status: string): StagePhase {
  return PHASE_BY_STATUS[status] ?? 'parked'
}

/** Tinted badge: border + 10% background + readable text. */
export function stageBadgeClass(status: string): string {
  return BADGE_BY_PHASE[stagePhase(status)]
}

/** Solid CSS colour for bars, dots and inline styles. */
export function stageColor(status: string): string {
  return `var(--stage-${stagePhase(status)})`
}

export function phaseColor(phase: StagePhase): string {
  return `var(--stage-${phase})`
}

/** Readable text colour for a phase (column titles, counts). */
export function phaseInk(phase: StagePhase): string {
  return `var(--stage-${phase}-ink)`
}
