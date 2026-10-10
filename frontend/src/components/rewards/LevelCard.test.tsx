import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LevelCard } from './LevelCard'

const rewards = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/hooks/use-rewards-query', () => ({
  useMyRewardsQuery: () => ({ data: rewards.data, isPending: false }),
}))
vi.mock('@/hooks/use-xp-query', () => ({
  LEVEL_COLORS: { rookie: { bg: '', text: '', border: '' }, agent: { bg: '', text: '', border: '' } },
  useXpMeQuery: () => ({ data: { streak: 3, call_target: 10, calls_today: 4, streak_done_today: false } }),
}))

afterEach(cleanup)

describe('LevelCard', () => {
  it('shows the level from MYLE Points, never XP', () => {
    rewards.data = {
      eligible: true,
      level: { key: 'agent', label: 'Agent', mp: 400, next_label: 'Pro', next_at: 750, progress_pct: 30 },
    }
    render(<LevelCard />)
    expect(screen.getByText('AGENT')).toBeInTheDocument()
    expect(screen.getByText('400 MP')).toBeInTheDocument()
    expect(screen.getByText('350 MP to Pro')).toBeInTheDocument()
    expect(screen.getByText('3-day streak')).toBeInTheDocument()
    expect(screen.queryByText(/XP/)).toBeNull()
  })

  it('hides for people who do not earn points (admin)', () => {
    rewards.data = { eligible: false }
    const { container } = render(<LevelCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
