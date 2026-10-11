import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppSetupCard } from './AppSetupCard'

const setup = { total: 2, ready: 1, installed: 1, notifications_on: 1, members: [
  { user_id: 1, name: 'Amit', role: 'team', app: 'browser', platform: 'ios', notifications: 'off', ready: false },
  { user_id: 2, name: 'Priya', role: 'team', app: 'installed', platform: 'android', notifications: 'on', ready: true },
] }
const runs = { jobs: [
  { job: 'morning_plan', label: 'Daily plan', scheduled: '9:00 AM', ran: true, runs: 1, targeted: 25, sent: 18, error: null },
  { job: 'call_target_reminder', label: 'Call target reminder', scheduled: '5:00 PM', ran: false, runs: 0, targeted: 0, sent: 0, error: null },
  { job: 'evening_recap', label: 'Evening recap', scheduled: '8:30 PM', ran: true, runs: 1, targeted: 0, sent: 0, error: 'boom' },
] }

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('push-runs') ? runs : setup), { status: 200 })),
}))

afterEach(() => cleanup())

describe('AppSetupCard', () => {
  it("shows today's automatic notifications and who is not set up", async () => {
    render(<QueryClientProvider client={new QueryClient()}><AppSetupCard /></QueryClientProvider>)
    // Collapsed by default: a one-line summary, no long lists.
    expect(await screen.findByText(/failed/)).toBeTruthy()
    expect(screen.queryByText('Amit')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Auto notifications/ }))
    expect(screen.getByText('18 of 25 reached')).toBeTruthy()
    expect(screen.getByText('Not run yet')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Show who/ }))
    expect(screen.getByText('Amit')).toBeTruthy()
  })
})
