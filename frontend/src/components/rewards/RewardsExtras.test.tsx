import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MyRewards } from '@/hooks/use-rewards-query'
import { powerHourLine, streakLine } from '@/lib/rewards'
import { RewardsExtras, StreakPowerLines } from './RewardsExtras'

const scratch = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/use-rewards-query', () => ({ useScratchCardMutation: () => scratch }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

afterEach(cleanup)

const data = {
  streak: { days: 7, goal: 7, doubled: true },
  power_hour: {
    enabled: true,
    start: new Date(Date.now() - 600_000).toISOString(),
    end: new Date(Date.now() + 1_800_000).toISOString(),
    active: true,
  },
  scratch_cards: [
    { id: 1, source: 'Enrollment payment (first closing)', lead_name: 'Ravi', scratched: false, amount_rupees: 0, bonus_points: 0 },
    { id: 2, source: 'Day 2 test passed', lead_name: 'Sonu', scratched: true, amount_rupees: 20, bonus_points: 0 },
  ],
  league: {
    week_start: '2026-10-05', ends_at: '2026-10-12T00:00:00+05:30', pot_rupees: 500, min_mp: 100,
    my_team: { name: 'Aman', rank: 2, score: 120, my_points: 60 },
    top: [{ name: 'Neha', score: 150, members: 4 }, { name: 'Aman', score: 120, members: 6 }],
  },
  season: {
    month: '2026-10-01', my_rank: 5, my_points: 340,
    top: [{ rank: 1, name: 'Priya', points: 900, prize_rupees: 700 }],
    most_improved: { name: 'Rahul', gain: 400, prize_rupees: 500 },
  },
  badges: [
    { key: 'first_enroll', label: 'First Enrollment', earned: true },
    { key: 'closer', label: 'Closer', earned: false },
  ],
} as unknown as MyRewards

describe('RewardsExtras', () => {
  it('shows scratch cards, league, season and badges', () => {
    render(<RewardsExtras data={data} />)
    expect(screen.getByText('Tap to scratch')).toBeInTheDocument()
    expect(screen.getByText('₹20')).toBeInTheDocument()
    expect(screen.getByText('Team League · ₹500 this week')).toBeInTheDocument()
    expect(screen.getByText(/Team Aman is #2 · you: 60 MP \(40 more to share the prize\)/)).toBeInTheDocument()
    expect(screen.getByText('October Season')).toBeInTheDocument()
    expect(screen.getByText('Most Improved: Rahul')).toBeInTheDocument()
    expect(screen.getByText('Badges · 1/2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tap to scratch'))
    expect(scratch.mutate).toHaveBeenCalledWith(1, expect.anything())
  })

  it('shows streak and an active Power Hour', () => {
    render(<StreakPowerLines data={data} now={Date.now()} />)
    expect(screen.getByText('7-day streak — your tickets count double today')).toBeInTheDocument()
    expect(screen.getByText(/Power Hour is on — every step counts 2× until/)).toBeInTheDocument()
  })
})

describe('streak / power hour copy', () => {
  it('streak line', () => {
    expect(streakLine({ days: 0, goal: 7, doubled: false })).toBe('Earn a ticket 7 days in a row to double your tickets')
    expect(streakLine({ days: 6, goal: 7, doubled: false })).toBe('6-day streak — 1 more day for double tickets')
  })

  it('power hour hidden once it is over or off', () => {
    const past = { enabled: true, start: '2026-10-06T12:30:00Z', end: '2026-10-06T13:30:00Z', active: false }
    expect(powerHourLine(past, Date.parse('2026-10-06T14:00:00Z'))).toBeNull()
    expect(powerHourLine({ ...past, enabled: false }, Date.parse('2026-10-06T10:00:00Z'))).toBeNull()
    expect(powerHourLine(past, Date.parse('2026-10-06T10:00:00Z'))).toMatch(/^Power Hour .*: steps count 2×$/)
  })
})
