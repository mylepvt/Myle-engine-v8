import { describe, expect, it } from 'vitest'

import { currentSectionForLead, nextSectionForLead } from '@/lib/lead-section'

describe('lead-section', () => {
  it('maps archived leads to the archived section', () => {
    expect(
      currentSectionForLead({ status: 'day1', archived_at: '2026-04-22T00:00:00Z' } as const, 'admin'),
    ).toEqual({
      label: 'Archived Leads',
      path: '/dashboard/work/archived',
    })
  })

  it('shows workboard day routing for post-mindset stages', () => {
    expect(
      currentSectionForLead({ status: 'day2', archived_at: null } as const, 'leader'),
    ).toEqual({
      label: 'Workboard -> Day 2',
      path: '/dashboard/work/workboard?tab=day2#pipeline',
    })
  })

  it('suggests the next section when a lead is about to leave the calling board', () => {
    expect(
      nextSectionForLead({ status: 'video_watched', archived_at: null } as const, 'admin'),
    ).toEqual({
      label: 'Workboard -> Mindset Lock',
      path: '/dashboard/work/workboard#mindset-lock',
    })
  })

  it('links downstream workboard transitions to the correct tab', () => {
    expect(
      nextSectionForLead({ status: 'day1', archived_at: null } as const, 'leader'),
    ).toEqual({
      label: 'Workboard -> Day 2',
      path: '/dashboard/work/workboard?tab=day2#pipeline',
    })
  })

  it('does not emit a next-section hint when the lead stays in the same surface', () => {
    expect(
      nextSectionForLead({ status: 'contacted', archived_at: null } as const, 'leader'),
    ).toBeNull()
  })

  it('skips the manual whatsapp-sent step after invitation', () => {
    expect(
      nextSectionForLead({ status: 'invited', archived_at: null } as const, 'team'),
    ).toBeNull()
  })
})
