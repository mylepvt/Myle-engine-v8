import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import SettingsPage from '@/pages/SettingsPage'

const apiFetch = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiUrl: (p: string) => p,
}))
vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => ({ data: { role: 'team' } }),
}))
vi.mock('@/components/notifications/PushNotificationToggle', () => ({
  PushNotificationToggle: () => null,
}))
vi.mock('@/components/notifications/AdminLiveAlertsCard', () => ({
  AdminLiveAlertsCard: () => null,
}))

const profile = {
  id: 201,
  fbo_id: 'T00201',
  username: 'team_201',
  email: 'team201@test.myle',
  role: 'team',
  phone: null,
  name: 'Old Name',
  avatar_url: null,
  registration_status: 'approved',
  created_at: '2026-09-01T00:00:00',
}
const preferences = {
  email_notifications: true,
  push_notifications: true,
  daily_report_reminders: true,
  lead_assignment_alerts: true,
  payment_notifications: true,
  training_reminders: true,
  weekly_summary: true,
  language: 'en',
  timezone: 'Asia/Kolkata',
  theme: 'system',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage profile', () => {
  let patchResponse: () => Response

  beforeEach(() => {
    patchResponse = () => json({ message: 'Profile updated: name' })
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/profile') && init?.method === 'PATCH') return Promise.resolve(patchResponse())
      if (url.endsWith('/profile')) return Promise.resolve(json(profile))
      if (url.endsWith('/preferences')) return Promise.resolve(json(preferences))
      return Promise.resolve(json({}))
    })
  })

  afterEach(() => {
    cleanup()
    apiFetch.mockReset()
  })

  it('saves only the field the member changed', async () => {
    renderPage()
    const name = await screen.findByLabelText('Full Name')
    await waitFor(() => expect(name).toHaveValue('Old Name'))

    const save = screen.getByRole('button', { name: 'Save Profile' })
    expect(save).toBeDisabled()

    fireEvent.change(name, { target: { value: 'New Name ' } })
    fireEvent.click(save)

    await screen.findByText('Profile updated successfully.')
    const patch = apiFetch.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(patch![1].body)).toEqual({ name: 'New Name' })
  })

  it('shows the server reason when a save is rejected', async () => {
    patchResponse = () => json({ detail: 'Phone number already registered' }, 400)
    renderPage()
    const phone = await screen.findByLabelText('Phone')
    await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Old Name'))
    fireEvent.change(phone, { target: { value: '9000000290' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Phone number already registered')
  })
})
