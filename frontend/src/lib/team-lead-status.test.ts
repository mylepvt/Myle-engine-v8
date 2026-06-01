import { describe, expect, it } from 'vitest'

import { LEAD_STATUS_OPTIONS, type LeadStatus } from '@/hooks/use-leads-query'

import { leadStatusSelectOptionsForLead, teamLeadStatusSelectOptions } from './team-lead-status'

describe('team-lead-status', () => {
  it('blocks team from leader-only day stages', () => {
    const values = teamLeadStatusSelectOptions('team', LEAD_STATUS_OPTIONS).map((option) => option.value)

    expect(values).not.toContain('day1')
    expect(values).not.toContain('day2')
    expect(values).not.toContain('day3')
    expect(values).toContain('video_sent')
    expect(values).toContain('video_watched')
  })

  it('keeps an otherwise-hidden current stage selectable for a leader-owned lead', () => {
    const values = leadStatusSelectOptionsForLead('leader', 'training' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values[0]).toBe('training')
    expect(values).toContain('day2')
  })
})
