import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LiveSessionPage } from '@/pages/LiveSessionPage'

const mockUseShellStubQuery = vi.fn()
const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (...args: Parameters<typeof actual.useQuery>) => mockUseQuery(...args),
  }
})

vi.mock('@/hooks/use-shell-stub-query', () => ({
  useShellStubQuery: () => mockUseShellStubQuery(),
}))

vi.mock('@/lib/safe-http-url', () => ({
  isSafeHttpUrl: (value: string) => value.startsWith('http://') || value.startsWith('https://'),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('LiveSessionPage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a copy button and copies the published session link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    mockUseQuery.mockReturnValue({
      data: { slots: [], active_hour: null },
      isPending: false,
      isError: false,
      error: null,
    })

    mockUseShellStubQuery.mockReturnValue({
      data: { items: [], note: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWithProviders(<LiveSessionPage title="Live session" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy for WhatsApp' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    expect(screen.getByText('✓ Copied!')).toBeInTheDocument()
  })
})
