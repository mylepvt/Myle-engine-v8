import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WinsFeedCard } from './WinsFeedCard'

const items = [
  { id: 1, kind: 'enrollment', user_id: 2, name: 'Priya', text: 'Priya enrolled a new prospect',
    created_at: new Date().toISOString(), cheers: 0, cheered_by_me: false, is_mine: false },
  { id: 2, kind: 'streak', user_id: 9, name: 'Sam', text: 'Sam is on a 7-day streak',
    created_at: new Date().toISOString(), cheers: 3, cheered_by_me: false, is_mine: true },
]

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.endsWith('/cheer') ? { cheered: true, cheers: 1 } : { items }), { status: 200 }),
  ),
}))

afterEach(() => cleanup())

describe('WinsFeedCard', () => {
  it('lists wins, says "You" for my own, and cheers instantly', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WinsFeedCard />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Priya enrolled a new prospect')).toBeTruthy()
    expect(screen.getByText('You are on a 7-day streak')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Cheer this win' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove cheer' }).textContent).toContain('1'))
  })
})
