import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { takeNewPoints, ticketLine, untilDraw } from '@/lib/rewards'
import { RewardsCard } from './RewardsCard'

const state = vi.hoisted(() => ({
  data: {
    eligible: true,
    points_today: 130,
    points_total: 900,
    tickets: 2,
    max_tickets: 10,
    mp_per_ticket: 50,
    next_ticket_in: 20,
    pot_rupees: 300,
    draw_at: new Date(Date.now() + 90 * 60_000).toISOString(),
    last_draw: { date: '2026-10-05', pot_rupees: 150, winner_user_id: 9, winner_name: 'Neha', players: 8, tickets_total: 30, rolled_over: false },
    recent: [
      { id: 7, step: 'video_watched', label: 'Prospect watched the Day 1 video', points: 25, lead_name: 'Ravi', at: new Date().toISOString(), revoked: false },
    ],
    pipeline: {
      total_rupees: 13_000, at_risk_rupees: 1_500, active: 3, at_risk: 1,
      leads: [],
    },
    table: [{ step: 'converted', label: 'Closing — converted', points: 150 }],
  } as Record<string, unknown>,
}))

vi.mock('@/hooks/use-rewards-query', () => ({
  useMyRewardsQuery: () => ({ data: state.data, isPending: false, isError: false }),
  useJackpotWheelQuery: () => ({ data: undefined }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

afterEach(cleanup)
beforeEach(() => window.localStorage.clear())

describe('RewardsCard', () => {
  it('shows pot, tickets, last winner, pipeline and the points table', () => {
    render(<MemoryRouter><RewardsCard /></MemoryRouter>)
    expect(screen.getByText('₹300')).toBeInTheDocument()
    expect(screen.getByText('2 / 10 tickets')).toBeInTheDocument()
    expect(screen.getByText(/20 MP more for another ticket/)).toBeInTheDocument()
    expect(screen.getByText('Last draw: Neha won ₹150')).toBeInTheDocument()
    expect(screen.getByText('Your pipeline: ₹13,000')).toBeInTheDocument()
    expect(screen.getByText('₹1,500 at risk — 1 untouched 24h+')).toBeInTheDocument()
    expect(screen.getByText('+25')).toBeInTheDocument()
    fireEvent.click(screen.getByText('How to earn MP'))
    expect(screen.getByText('Closing — converted')).toBeInTheDocument()
  })

  it('is hidden for admins', () => {
    state.data = { ...state.data, eligible: false }
    const { container } = render(<MemoryRouter><RewardsCard /></MemoryRouter>)
    expect(container).toBeEmptyDOMElement()
    state.data = { ...state.data, eligible: true }
  })
})

describe('rewards helpers', () => {
  it('counts down to the draw', () => {
    const now = Date.parse('2026-10-06T10:00:00Z')
    expect(untilDraw('2026-10-06T13:12:00Z', now)).toBe('3h 12m')
    expect(untilDraw('2026-10-06T10:05:00Z', now)).toBe('5m')
    expect(untilDraw('2026-10-06T09:00:00Z', now)).toBe('now')
  })

  it('ticket line', () => {
    const base = { tickets: 0, max_tickets: 10, next_ticket_in: 50 } as never
    expect(ticketLine(base)).toBe('50 MP more for your first ticket')
    expect(ticketLine({ ...(base as object), tickets: 10 } as never)).toMatch(/Max 10 tickets/)
  })

  it('only toasts points newer than the last visit', () => {
    const p = (id: number) => ({ id, step: 's', label: 'L', points: 10, lead_name: null, at: '', revoked: false })
    expect(takeNewPoints([p(3), p(2)])).toEqual([]) // first visit: no replay
    expect(takeNewPoints([p(5), p(4), p(3)]).map((x) => x.id)).toEqual([4, 5])
    expect(takeNewPoints([p(5)])).toEqual([])
  })
})
