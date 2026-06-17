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

  it('lets a leader advance forward into day3 (full status control)', () => {
    const values = leadStatusSelectOptionsForLead('leader', 'day2' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values).toContain('day3')
    expect(values).toContain('day2')
  })

  it('still lets a leader step backward into day3 as a correction', () => {
    const values = leadStatusSelectOptionsForLead('leader', 'converted' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values).toContain('day3')
  })

  it('keeps day3 visible when the lead is already at day3', () => {
    const values = leadStatusSelectOptionsForLead('leader', 'day3' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values).toContain('day3')
  })

  it('lets an admin advance forward into day3', () => {
    const values = leadStatusSelectOptionsForLead('admin', 'day2' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values).toContain('day3')
  })
})
