import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Day2ContactsCard } from './Day2ContactsCard'

const api = vi.hoisted(() => ({ status: {} as Record<string, unknown> }))
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => api.status })),
  apiUrl: (p: string) => p,
}))

function renderCard(path = '/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Day2ContactsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Day2ContactsCard', () => {
  beforeEach(() => {
    api.status = {}
  })

  it('shows the connected Google account and sync count', async () => {
    api.status = {
      configured: true,
      connected: true,
      email: 'karan@gmail.com',
      last_sync: new Date().toISOString(),
      last_count: 42,
      last_error: null,
    }
    renderCard('/dashboard?google_contacts=connected')
    expect(await screen.findByText('karan@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/42 contacts in the “MYLE Day 2” label/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    expect(screen.getByText(/Google connected — Day 2 contacts are syncing/)).toBeInTheDocument()
  })

  it('explains the missing server setup instead of offering Connect', async () => {
    api.status = {
      configured: false,
      connected: false,
      email: null,
      last_sync: null,
      last_count: 0,
      last_error: null,
      redirect_uri: 'https://x.onrender.com/api/v1/admin/contacts/google/callback',
    }
    renderCard()
    expect(await screen.findByText(/GOOGLE_CONTACTS_CLIENT_ID/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google/i })).toBeDisabled()
  })
})
