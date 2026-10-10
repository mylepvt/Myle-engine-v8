import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PointsLeaderboardCard } from './PointsLeaderboardCard'

const asked = vi.hoisted(() => ({ periods: [] as string[] }))
vi.mock('@/hooks/use-auth-me-query', () => ({ useAuthMeQuery: () => ({ data: { authenticated: true, user_id: 2 } }) }))
vi.mock('@/hooks/use-rewards-query', () => ({
  useMpLeaderboardQuery: (period: string) => {
    asked.periods.push(period)
    return {
      isPending: false,
      isError: false,
      data: {
        period,
        items: [
          { rank: 1, user_id: 1, name: 'Akansha', role: 'leader', mp: 170 },
          { rank: 2, user_id: 2, name: 'Priya', role: 'team', mp: 25 },
        ],
        me: { rank: 2, user_id: 2, name: 'Priya', role: 'team', mp: 25 },
        total: 2,
      },
    }
  },
}))

afterEach(cleanup)

describe('PointsLeaderboardCard', () => {
  it('ranks by MYLE Points and switches period', () => {
    render(<PointsLeaderboardCard />)
    expect(screen.getByText('170 MP')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Month' }))
    expect(asked.periods).toContain('month')
    expect(screen.queryByText(/XP/)).toBeNull()
  })
})
