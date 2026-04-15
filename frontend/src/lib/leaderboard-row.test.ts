import { describe, expect, it } from 'vitest'

import { parseLeaderboardStubItem } from '@/lib/leaderboard-row'

describe('parseLeaderboardStubItem', () => {
  it('parses canonical API shape', () => {
    const r = parseLeaderboardStubItem(
      {
        title: '#1 alice',
        detail: 'team · a@x.com · total points: 42',
        count: 1,
      },
      0,
    )
    expect(r).toEqual({
      rank: 1,
      name: 'alice',
      role: 'team',
      email: 'a@x.com',
      points: '42',
    })
  })

  it('tolerates pipe separators', () => {
    const r = parseLeaderboardStubItem(
      {
        title: '#2 bob',
        detail: 'leader | b@y.com | total points: 7',
        count: 2,
      },
      1,
    )
    expect(r.role).toBe('leader')
    expect(r.email).toBe('b@y.com')
    expect(r.points).toBe('7')
  })

  it('falls back rank to index', () => {
    const r = parseLeaderboardStubItem({ title: 'x', detail: '' }, 4)
    expect(r.rank).toBe(5)
  })
})
