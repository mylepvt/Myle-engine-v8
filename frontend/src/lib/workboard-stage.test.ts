import { describe, expect, it } from 'vitest'

import { isDay2AdvanceUnlocked } from '@/lib/workboard-stage'

describe('isDay2AdvanceUnlocked', () => {
  it('requires all Day 2 batches and a passed test', () => {
    expect(
      isDay2AdvanceUnlocked({
        d2_morning: true,
        d2_afternoon: true,
        d2_evening: true,
        day2_test_status: 'passed',
      }),
    ).toBe(true)
  })

  it('blocks advance until the test passes', () => {
    expect(
      isDay2AdvanceUnlocked({
        d2_morning: true,
        d2_afternoon: true,
        d2_evening: true,
        day2_test_status: 'pending',
      }),
    ).toBe(false)
  })

  it('blocks advance when a batch is still missing', () => {
    expect(
      isDay2AdvanceUnlocked({
        d2_morning: true,
        d2_afternoon: true,
        d2_evening: false,
        day2_test_status: 'passed',
      }),
    ).toBe(false)
  })
})
