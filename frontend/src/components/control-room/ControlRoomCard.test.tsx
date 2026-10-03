import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ControlRoomCard } from './ControlRoomCard'

const member = (user_id: number, name: string, status: string, calls: number) => ({
  user_id, name, role: 'team', status, calls_today: calls, last_work_at: null, last_seen_at: null,
  streak: 0, new_leads: 2, followups_due: 0, nudge_available_at: null,
})

const room = {
  call_target: 5,
  counts: { not_started: 1, idle: 0, working: 1, done: 0 },
  members: [member(1, 'Amit Kumar', 'not_started', 0), member(2, 'Priya', 'working', 3)],
}

const apiFetch = vi.fn(async (url: string, _init?: RequestInit) =>
  new Response(
    JSON.stringify(url.endsWith('/nudge') ? { delivered: true, nudge_available_at: new Date(Date.now() + 3600e3).toISOString() } : room),
    { status: 200 },
  ),
)
vi.mock('@/lib/api', () => ({ apiFetch: (url: string, init?: RequestInit) => apiFetch(url, init) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

afterEach(() => cleanup())

describe('ControlRoomCard', () => {
  it('shows stuck members first, filters, and nudges once', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ControlRoomCard />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Amit Kumar')).toBeTruthy()
    expect(screen.getByText('0/5 calls · not seen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cheer Priya' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Working/ }))
    expect(screen.queryByText('Amit Kumar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Working/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Amit' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Amit nudged' })).toHaveProperty('disabled', true))
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/control-room/1/nudge', { method: 'POST' })
  })
})
