import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

  it('says when no link is published', () => {
    mockUseQuery.mockReturnValue({ data: { items: [{ title: "Today's Live Session" }] }, isPending: false, isError: false })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText('No live session link has been published yet.')).toBeInTheDocument()
  })
})
