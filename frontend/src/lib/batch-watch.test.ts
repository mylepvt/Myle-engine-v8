import { describe, expect, it } from 'vitest'

import { buildBatchGreetingCopy, getBatchSlotPeriod, getLeadFirstName } from '@/lib/batch-watch'

describe('batch watch greeting copy', () => {
  it('extracts and title-cases the lead first name', () => {
    expect(getLeadFirstName('rahul sharma')).toBe('Rahul')
  })

  it('falls back safely when no name exists', () => {
    expect(getLeadFirstName('')).toBe('Champion')
  })

  it('detects slot periods from batch slot ids', () => {
    expect(getBatchSlotPeriod('d1_morning')).toBe('morning')
    expect(getBatchSlotPeriod('d2_afternoon')).toBe('afternoon')
    expect(getBatchSlotPeriod('d2_evening')).toBe('evening')
  })

  it('builds personalized morning copy for day 1 batch rooms', () => {
    const copy = buildBatchGreetingCopy({
      leadName: 'rahul sharma',
      dayNumber: 1,
      slot: 'd1_morning',
      slotLabel: 'Morning',
    })

    expect(copy.greetingLine).toBe('Good Morning Rahul')
    expect(copy.heroTitle).toBe('Your Day 1 Morning Batch is ready')
    expect(copy.reservedBadge).toBe('Reserved for Rahul')
    expect(copy.heroSubtitle).toContain('Watch this batch inside Myle')
  })

  it('builds upload plus evaluation copy for day 2 afternoon rooms', () => {
    const copy = buildBatchGreetingCopy({
      leadName: 'priya',
      dayNumber: 2,
      slot: 'd2_afternoon',
      slotLabel: 'Afternoon',
    })

    expect(copy.greetingLine).toBe('Good Afternoon Priya')
    expect(copy.heroSubtitle).toContain('upload your notes, voice note, video, or message here')
    expect(copy.mentorLine).toContain('Final batch ke baad business evaluation link')
    expect(copy.completionMessage).toContain('Priya')
  })
})
