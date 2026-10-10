import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MemberPoints } from '@/hooks/use-rewards-query'
import { MemberPointsCard } from './MemberPointsCard'

const member = (over: Partial<MemberPoints>): MemberPoints => ({
  user_id: 1, name: 'Priya', role: 'team', leader_name: 'Aman', today: 0, week: 0, month: 0, last_at: null, breakdown: [], ...over,
})
const members = [
  member({ user_id: 1, name: 'Priya', today: 5, week: 40, month: 120, last_at: new Date().toISOString(),
    breakdown: [{ label: 'Fast first call', count: 24, points: 120 }] }),
  member({ user_id: 2, name: 'Akansha', role: 'leader', leader_name: null, today: 20, week: 30, month: 90 }),
  member({ user_id: 3, name: 'Rahul' }),
]
vi.mock('@/hooks/use-rewards-query', () => ({
  useAdminMemberPointsQuery: () => ({ data: { members }, isPending: false, isError: false }),
}))

afterEach(cleanup)

const names = () => screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent ?? '')

describe('MemberPointsCard', () => {
  it('ranks members by the chosen period and shows what the points were for', () => {
    render(<MemberPointsCard />)
    expect(screen.getByText('210 MP · 2/3 earning')).toBeInTheDocument()
    expect(names()[0]).toContain('Priya')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(names()[0]).toContain('Akansha')
    expect(screen.getByText('25 MP · 2/3 earning')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Priya/ }))
    expect(screen.getByText('Team of Aman')).toBeInTheDocument()
    expect(screen.getByText('+120')).toBeInTheDocument()
  })
})
