import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LeadPublic } from '@/hooks/use-leads-query'
import { SendToDay1Button } from './SendToDay1Button'

const depositState = vi.hoisted(() => ({ consent: null as null | Record<string, unknown> }))

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () =>
    new Response(
      JSON.stringify({
        gate_enabled: true,
        min_rupees: 149,
        max_rupees: 200,
        payment_modes: { upi: 'UPI', bank_transfer: 'Bank transfer' },
        consent: depositState.consent,
        receipt: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  ),
}))

afterEach(() => {
  cleanup()
  depositState.consent = null
})

function renderButton() {
  const lead = { id: 5, name: 'Rohit', status: 'video_watched', phone: '9811100001' } as LeadPublic
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        {/* Same styling as the calling-board card that used to trap the modal. */}
        <div data-testid="card" className="relative overflow-hidden backdrop-blur-md">
          <SendToDay1Button lead={lead} />
        </div>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const waitingLink = {
  id: 1,
  state: 'given',
  amount_rupees: 196,
  token: 'tok123',
  created_at: '2026-10-20T05:00:00Z',
  expires_at: '2026-10-22T05:00:00Z',
  given_at: '2026-10-20T05:10:00Z',
  typed_name: 'Rohit',
  withdrawn_at: null,
  registration_stage: 'register',
  reg_name: null,
  reg_email: null,
  reg_phone: null,
  reg_submitted_at: null,
  match_status: null,
  match_detail: null,
  member_proof_url: '/api/v1/media/enrollment-proofs/a.png',
  prospect_proof_url: null,
  welcome_email_sent_at: null,
}

describe('SendToDay1Button', () => {
  it('opens its form over the whole screen, not trapped inside the blurred card', async () => {
    const { container } = renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Send to Day 1/ }))
    const dialog = screen.getByRole('dialog', { name: 'Send to Day 1' })
    expect(screen.getByTestId('card').contains(dialog)).toBe(false)
    // Portalled: its fixed overlay is a direct child of <body>.
    expect(dialog.closest('.fixed')?.parentElement).toBe(document.body)
    expect(container.contains(dialog)).toBe(false)
    expect(await screen.findByText('Payment screenshot')).toBeTruthy()
  })

  it('takes the payment first — no consent step before the upload', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Send to Day 1/ }))
    expect(await screen.findByText('Payment screenshot')).toBeTruthy()
    expect(screen.getByText('UPI Ref No. / UTR (12 digits)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload & send link' })).toBeTruthy()
    expect(screen.queryByText(/Send consent link on WhatsApp/)).toBeNull()
  })

  it('shows the link waiting on the prospect, with send again and upload again', async () => {
    depositState.consent = waitingLink
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Send to Day 1/ }))
    expect(await screen.findByText('Rohit agreed, waiting for the registration form')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Send link again/ })).toBeTruthy()
    expect(screen.queryByText('Payment screenshot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Upload again' }))
    expect(screen.getByText('Payment screenshot')).toBeTruthy()
  })

  it('a mismatch shows both screenshots; only a leader gets the approve button', async () => {
    depositState.consent = { ...waitingLink, registration_stage: 'mismatch', match_status: 'mismatch', match_detail: 'Transaction ID not found', prospect_proof_url: '/b.png' }
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Send to Day 1/ }))
    expect(await screen.findByText(/Screenshot didn/)).toBeTruthy()
    expect(screen.getByText('Transaction ID not found')).toBeTruthy()
    expect(screen.getByText(/Prospect.s screenshot/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve enrollment/ })).toBeNull()
  })
})
