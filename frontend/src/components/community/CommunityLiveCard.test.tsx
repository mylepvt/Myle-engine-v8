import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CommunityLiveCard } from './CommunityLiveCard'

const live = vi.hoisted(() => ({
  data: {
    online_now: 5,
    online_names: ['Priya', 'Rahul', 'Aman'],
    today: { calls: 142, followups: 37, members_worked: 21, leads_added: 0 },
    week: { calls: 900, followups: 200, members_worked: 40, leads_added: 60 },
    feed: [
      { kind: 'call', user_id: 1, text: 'Priya made 4 calls', at: new Date().toISOString() },
      { kind: 'batch', user_id: 2, text: "Rahul's prospect watched a Day 1 batch", at: new Date().toISOString() },
    ],
    generated_at: new Date().toISOString(),
  },
}))

vi.mock('@/hooks/use-community-live-query', () => ({
  useCommunityLiveQuery: () => ({ data: live.data, isPending: false, isError: false }),
}))

describe('CommunityLiveCard', () => {
  it('shows who is online, today totals (zero tiles hidden) and the feed', () => {
    render(<CommunityLiveCard />)
    expect(screen.getByText('5 online')).toBeInTheDocument()
    expect(screen.getByText('Priya, Rahul and 3 more are working right now')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('142')).toBeInTheDocument()
    expect(screen.queryByText('New leads')).not.toBeInTheDocument()
    expect(screen.getByText('Priya made 4 calls')).toBeInTheDocument()
    expect(screen.getByText("Rahul's prospect watched a Day 1 batch")).toBeInTheDocument()
  })
})
