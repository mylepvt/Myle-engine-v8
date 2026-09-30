import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { buildLiveSessionMessage } from '@/lib/live-session-message'
import { LiveSessionPage } from '@/pages/LiveSessionPage'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (...args: Parameters<typeof actual.useQuery>) => mockUseQuery(...args),
  }
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('LiveSessionPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the published live session with a Join link', () => {
    mockUseQuery.mockReturnValue({
      data: { items: [{ title: 'Daily 2 PM Training', detail: 'Scheduled: 2 PM', external_href: 'https://zoom.us/j/1' }] },
      isPending: false,
      isError: false,
    })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText('Daily 2 PM Training')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Join Now/ })).toHaveAttribute('href', 'https://zoom.us/j/1')
    expect(screen.queryByText(/Copy D\d WA msg/)).not.toBeInTheDocument()
  })

  it('copies a formatted message (date, title, details, link) to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mockUseQuery.mockReturnValue({
      data: {
        items: [
          {
            title: 'Daily 2 PM Training',
            detail: 'ID 836 4190 3667 · Passcode 303948',
            external_href: 'https://zoom.us/j/1',
            updated_at: '2026-09-30T13:05:00+05:30',
          },
        ],
      },
      isPending: false,
      isError: false,
    })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText(/Link updated:/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Copy message/ }))
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain("*Today's Live Session*")
    expect(copied).toContain('*Daily 2 PM Training*')
    expect(copied).toContain('ID 836 4190 3667 · Passcode 303948')
    expect(copied).toContain('Join here: https://zoom.us/j/1')
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument())
  })

  it('puts the current IST date in the message', () => {
    const msg = buildLiveSessionMessage({ title: 'T' }, 'https://x.test', new Date('2026-09-30T08:00:00Z'))
    expect(msg.split('\n')[0]).toMatch(/30 Sept?,? 2026/)
  })

  it('says when no link is published', () => {
    mockUseQuery.mockReturnValue({ data: { items: [{ title: "Today's Live Session" }] }, isPending: false, isError: false })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText('No live session link has been published yet.')).toBeInTheDocument()
  })
})
