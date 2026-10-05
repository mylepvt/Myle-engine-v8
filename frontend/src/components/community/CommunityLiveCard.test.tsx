import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CommunityLiveCard } from './CommunityLiveCard'

const live = vi.hoisted(() => ({
  data: {
    online_now: 5,
    online_names: ['Priya', 'Rahul', 'Aman'],
    today: { calls: 142, followups: 37, members_worked: 21 },
    feed: [
      { kind: 'call', user_id: 1, text: 'Priya made 4 calls', at: new Date().toISOString() },
      { kind: 'win', user_id: 2, text: 'Rahul enrolled a new prospect', at: new Date().toISOString() },
    ],
    generated_at: new Date().toISOString(),
  },
}))

vi.mock('@/hooks/use-community-live-query', () => ({
  useCommunityLiveQuery: () => ({ data: live.data, isPending: false, isError: false }),
}))

describe('CommunityLiveCard', () => {
  it('shows who is online, today totals and the feed', () => {
    render(<CommunityLiveCard />)
    expect(screen.getByText('5 online')).toBeInTheDocument()
    expect(screen.getByText('Priya, Rahul and 3 more are working right now')).toBeInTheDocument()
    expect(screen.getByText('142')).toBeInTheDocument()
    expect(screen.getByText('Members working')).toBeInTheDocument()
    expect(screen.getByText('Priya made 4 calls')).toBeInTheDocument()
    expect(screen.getByText('Rahul enrolled a new prospect')).toBeInTheDocument()
  })
})
