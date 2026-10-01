import { describe, expect, it } from 'vitest'

import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'
import { stageBadgeClass, stagePhase } from '@/lib/stage-colors'

describe('stage colours', () => {
  it('maps every lead status explicitly (only retarget/inactive are parked)', () => {
    const parked = LEAD_STATUS_OPTIONS.map((o) => o.value).filter((v) => stagePhase(v) === 'parked')
    expect(parked.sort()).toEqual(['inactive', 'retarget'])
    expect(stageBadgeClass('day1')).toContain('text-stage-engaged-ink')
  })

  it('shows Converted as won and Lost as lost', () => {
    expect(stagePhase('converted')).toBe('won')
    expect(stagePhase('lost')).toBe('lost')
    expect(stagePhase('day2')).toBe('closing')
  })
})
