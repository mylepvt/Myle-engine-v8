import { describe, expect, it } from 'vitest'

import { buildDay2BusinessTestWhatsAppUrl } from '@/lib/day2-business-test'

describe('buildDay2BusinessTestWhatsAppUrl', () => {
  it('returns null when the lead phone is missing', () => {
    expect(
      buildDay2BusinessTestWhatsAppUrl({
        leadName: 'Priya',
        phone: '',
      }),
    ).toBeNull()
  })

  it('sends a safe update when the public business-evaluation link is not wired yet', () => {
    const url = buildDay2BusinessTestWhatsAppUrl({
      leadName: 'Priya',
      phone: '+91 98765 43210',
    })

    expect(url).not.toBeNull()
    const text = new URL(url!).searchParams.get('text')
    expect(text).toContain('Day 2 business evaluation is separate from the 7-day training test.')
    expect(text).toContain('Coordinator will share the business evaluation link separately.')
    expect(text).not.toContain('/dashboard/system/training')
  })

  it('includes the direct evaluation link when one is available', () => {
    const url = buildDay2BusinessTestWhatsAppUrl({
      leadName: 'Priya',
      phone: '9876543210',
      testUrl: 'https://app.example.com/day2-test/demo-token',
    })

    expect(url).not.toBeNull()
    const text = new URL(url!).searchParams.get('text')
    expect(text).toContain('Please complete your Day 2 business evaluation using this link:')
    expect(text).toContain('https://app.example.com/day2-test/demo-token')
  })
})
