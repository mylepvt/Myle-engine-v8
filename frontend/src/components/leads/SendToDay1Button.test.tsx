import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import type { LeadPublic } from '@/hooks/use-leads-query'
import { SendToDay1Button } from './SendToDay1Button'

afterEach(() => cleanup())

describe('SendToDay1Button', () => {
  it('opens its form over the whole screen, not trapped inside the blurred card', () => {
    const lead = { id: 5, name: 'Rohit', status: 'video_watched' } as LeadPublic
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          {/* Same styling as the calling-board card that used to trap the modal. */}
          <div data-testid="card" className="relative overflow-hidden backdrop-blur-md">
            <SendToDay1Button lead={lead} />
          </div>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Send to Day 1/ }))
    const dialog = screen.getByRole('dialog', { name: 'Send to Day 1' })
    expect(screen.getByTestId('card').contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    expect(container.contains(dialog)).toBe(false)
    expect(screen.getByText('Payment screenshot')).toBeTruthy()
  })
})
