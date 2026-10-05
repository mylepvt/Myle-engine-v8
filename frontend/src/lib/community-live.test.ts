import { describe, expect, it } from 'vitest'

import type { CommunityLive } from '@/hooks/use-community-live-query'
import { onlineLine, pickStats } from '@/lib/community-live'

function live(over: Partial<CommunityLive>): CommunityLive {
  return {
    online_now: 0,
    online_names: [],
    today: { calls: 0, followups: 0, members_worked: 0, leads_added: 0 },
    week: { calls: 0, followups: 0, members_worked: 0, leads_added: 0 },
    feed: [],
    generated_at: '',
    ...over,
  }
}

describe('community live helpers', () => {
  it('falls back to the week while today is quiet', () => {
    const r = pickStats(live({
      today: { calls: 8, followups: 1, members_worked: 2, leads_added: 0 },
      week: { calls: 640, followups: 0, members_worked: 31, leads_added: 55 },
    }))
    expect(r.period).toBe('This week')
    expect(r.stats.map((s) => s.label)).toEqual(['Calls', 'New leads', 'Members working'])
  })

  it('uses today once it picks up', () => {
    const r = pickStats(live({ today: { calls: 40, followups: 5, members_worked: 9, leads_added: 3 } }))
    expect(r.period).toBe('Today')
    expect(r.stats[0]).toEqual({ value: 40, label: 'Calls' })
  })

  it('hides a small online count', () => {
    expect(onlineLine(live({ online_now: 2, online_names: ['A', 'B'] }))).toBeNull()
    expect(onlineLine(live({ online_now: 3, online_names: ['A', 'B', 'C'] }))).toBe('A, B and 1 more are working right now')
  })
})
