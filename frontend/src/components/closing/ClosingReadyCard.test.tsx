import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClosingReadyCard } from './ClosingReadyCard'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ items: [
    { lead_id: 7, name: 'Rohit Kumar', phone: '9876500000', city: null, owner_name: 'Priya', assigned_name: 'Neha',
      interview_at: '2026-10-04T08:00:00Z', session_watched_at: '2026-10-04T09:30:00Z' },
  ] }), { status: 200 })),
}))

afterEach(() => cleanup())

describe('ClosingReadyCard', () => {
  it('lists today\'s closing prospects with call and WhatsApp', async () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}><ClosingReadyCard /></QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Rohit Kumar')).toBeTruthy()
    expect(screen.getByText(/9876500000 · Priya · session/)).toBeTruthy()
    expect(document.querySelector('a[href^="tel:"]')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Phone and WhatsApp' })).toBeTruthy()
  })
})
