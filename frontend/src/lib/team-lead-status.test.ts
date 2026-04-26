import { describe, expect, it } from 'vitest'

import { LEAD_STATUS_OPTIONS, type LeadStatus } from '@/hooks/use-leads-query'

import { leadStatusSelectOptionsForLead, teamLeadStatusSelectOptions } from './team-lead-status'

describe('team-lead-status', () => {
  it('hides whatsapp_sent as a direct selectable status', () => {
    const values = teamLeadStatusSelectOptions('team', LEAD_STATUS_OPTIONS).map((option) => option.value)

    expect(values).not.toContain('whatsapp_sent')
    expect(values).toContain('video_sent')
  })

  it('keeps current whatsapp_sent leads selectable while next move remains video_sent', () => {
    const values = leadStatusSelectOptionsForLead('leader', 'whatsapp_sent' as LeadStatus, LEAD_STATUS_OPTIONS).map(
      (option) => option.value,
    )

    expect(values[0]).toBe('whatsapp_sent')
    expect(values).toContain('video_sent')
  })
})
