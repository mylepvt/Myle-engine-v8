export type BatchSlotPeriod = 'morning' | 'afternoon' | 'evening' | 'unknown'

type BuildBatchGreetingArgs = {
  leadName: string | null | undefined
  dayNumber: number
  slot: string
  slotLabel: string
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function getLeadFirstName(leadName: string | null | undefined): string {
  const firstName = (leadName ?? '').trim().split(/\s+/)[0] ?? ''
  return firstName ? toTitleCase(firstName) : 'Champion'
}

export function getBatchSlotPeriod(slot: string): BatchSlotPeriod {
  if (slot.includes('morning')) return 'morning'
  if (slot.includes('afternoon')) return 'afternoon'
  if (slot.includes('evening')) return 'evening'
  return 'unknown'
}

export function buildBatchGreetingCopy({
  leadName,
  dayNumber,
  slot,
  slotLabel,
}: BuildBatchGreetingArgs) {
  const firstName = getLeadFirstName(leadName)
  const period = getBatchSlotPeriod(slot)

  const periodMap: Record<
    BatchSlotPeriod,
    {
      greeting: string
      energyLine: string
      focusLine: string
      trustLine: string
      completionVerb: string
    }
  > = {
    morning: {
      greeting: 'Good Morning',
      energyLine: 'Start your day strong inside Myle.',
      focusLine: 'Fresh focus, private batch room, zero distractions.',
      trustLine: 'Your morning batch is reserved personally for you.',
      completionVerb: 'morning batch is completed and tracked',
    },
    afternoon: {
      greeting: 'Good Afternoon',
      energyLine: 'Keep your momentum high without leaving the app.',
      focusLine: 'One focused batch room to watch, confirm, and continue.',
      trustLine: 'Your afternoon batch is lined up for smooth in-app follow-through.',
      completionVerb: 'afternoon batch is completed and tracked',
    },
    evening: {
      greeting: 'Good Evening',
      energyLine: 'Close the day with clarity and confidence.',
      focusLine: 'Premium room, calmer flow, and a clean final push for the day.',
      trustLine: 'Your evening batch stays private and polished all the way through.',
      completionVerb: 'evening batch is completed and tracked',
    },
    unknown: {
      greeting: 'Hello',
      energyLine: 'Your private batch room is ready inside Myle.',
      focusLine: 'Watch, confirm, and continue in one branded flow.',
      trustLine: 'This batch room was shared personally for you.',
      completionVerb: 'batch is completed and tracked',
    },
  }

  const tone = periodMap[period]

  return {
    firstName,
    greetingLine: `${tone.greeting} ${firstName}`,
    heroTitle: `Your Day ${dayNumber} ${slotLabel} Batch is ready`,
    heroSubtitle:
      dayNumber === 2
        ? `${tone.energyLine} Watch this batch inside Myle and upload your notes, voice note, video, or message here. Final Day 2 batch ke baad business evaluation link alag se share hota hai.`
        : `${tone.energyLine} Watch this batch inside Myle and stay in the same premium flow.`,
    reservedBadge: `Reserved for ${firstName}`,
    privateRoomBadge: `${slotLabel} private room`,
    focusLine: tone.focusLine,
    trustLine: tone.trustLine,
    mentorLine:
      dayNumber === 2
        ? `After each Day 2 batch, upload isi screen se jata hai. Final batch ke baad business evaluation link coordinator alag se share karta hai.`
        : `After this batch, your progress stays tracked inside the same Myle room.`,
    completionMessage: `Nice work ${firstName}, your ${tone.completionVerb}.`,
  }
}
