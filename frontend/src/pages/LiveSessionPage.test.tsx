import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LiveSessionPage } from '@/pages/LiveSessionPage'

const mockUseShellStubQuery = vi.fn()

vi.mock('@/hooks/use-shell-stub-query', () => ({
  useShellStubQuery: () => mockUseShellStubQuery(),
}))

vi.mock('@/lib/safe-http-url', () => ({
  isSafeHttpUrl: (value: string) => value.startsWith('http://') || value.startsWith('https://'),
}))

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

    mockUseShellStubQuery.mockReturnValue({
      data: {
        items: [
          {
            title: '2 PM Session',
            detail: 'Scheduled: 2:00 PM',
            external_href: 'https://meet.google.com/example',
          },
        ],
        note: null,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<LiveSessionPage title="Live session" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://meet.google.com/example')
    })
    expect(screen.getByText('Link copied')).toBeInTheDocument()
  })
})
