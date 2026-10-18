import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { NoticeBoardPage } from '@/pages/NoticeBoardPage'

const apiFetch = vi.fn()
const mockMe = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiUrl: (p: string) => p,
}))
vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => mockMe(),
}))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const voiceNotice = {
  id: 7,
  message: 'Listen before the 2 PM call',
  created_by: 'admin',
  pin: false,
  created_at: '2026-10-18T05:00:00Z',
  reactions: [],
  audio_url: '/api/v1/other/notice-board/7/audio',
  audio_duration_sec: 75,
  played_by_me: false,
  reply_count: 1,
  played_count: 1,
  audience_count: 3,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NoticeBoardPage title="Notice Board" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function calls(method: string, suffix: string) {
  return apiFetch.mock.calls.filter(
    ([url, init]) => String(url).endsWith(suffix) && (init?.method ?? 'GET') === method,
  )
}

describe('NoticeBoardPage voice notices', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.endsWith('/notice-board') && method === 'GET') {
        return Promise.resolve(json({ items: [voiceNotice], total: 1, note: null }))
      }
      if (url.endsWith('/played')) return Promise.resolve(new Response(null, { status: 204 }))
      if (url.endsWith('/replies') && method === 'GET') {
        return Promise.resolve(
          json({
            items: [
              {
                id: 1,
                announcement_id: 7,
                user_id: 202,
                author: 'Ravi Leader',
                role: 'leader',
                body: 'Noted, sharing with team',
                created_at: '2026-10-18T05:05:00Z',
                mine: false,
                can_delete: false,
              },
            ],
            total: 1,
          }),
        )
      }
      if (url.endsWith('/replies') && method === 'POST') {
        return Promise.resolve(
          json(
            {
              id: 2,
              announcement_id: 7,
              user_id: 201,
              author: 'Asha',
              role: 'team',
              body: 'Done!',
              created_at: '2026-10-18T05:06:00Z',
              mine: true,
              can_delete: true,
            },
            201,
          ),
        )
      }
      if (url.endsWith('/listeners')) {
        return Promise.resolve(
          json({
            announcement_id: 7,
            audience_count: 3,
            played: [
              {
                user_id: 201,
                name: 'Asha Team',
                role: 'team',
                fbo_id: 'T1',
                first_played_at: '2026-10-18T05:10:00Z',
                last_played_at: '2026-10-18T05:10:00Z',
                play_count: 1,
                completed: true,
              },
            ],
            not_played: [
              { user_id: 202, name: 'Ravi Leader', role: 'leader', fbo_id: 'T2', first_played_at: null, last_played_at: null, play_count: 0, completed: false },
              { user_id: 204, name: 'Neha Team', role: 'team', fbo_id: 'T4', first_played_at: null, last_played_at: null, play_count: 0, completed: false },
            ],
          }),
        )
      }
      return Promise.resolve(json({}))
    })
  })

  afterEach(() => {
    cleanup()
    apiFetch.mockReset()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('member plays a new voice notice and it is recorded as played', async () => {
    mockMe.mockReturnValue({ data: { authenticated: true, role: 'team' } })
    renderPage()

    expect(await screen.findByText('New')).toBeInTheDocument()
    expect(screen.getByText('1:15')).toBeInTheDocument()
    expect(screen.queryByText(/Played 1\/3/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play voice note' }))

    await waitFor(() => expect(calls('POST', '/notice-board/7/played')).toHaveLength(1))
    expect(JSON.parse(calls('POST', '/notice-board/7/played')[0][1].body)).toEqual({ completed: false })
    await waitFor(() => expect(screen.queryByText('New')).not.toBeInTheDocument())

    fireEvent.ended(document.querySelector('audio')!)
    await waitFor(() => expect(calls('POST', '/notice-board/7/played')).toHaveLength(2))
    expect(JSON.parse(calls('POST', '/notice-board/7/played')[1][1].body)).toEqual({ completed: true })
  })

  it('member reads and posts replies', async () => {
    mockMe.mockReturnValue({ data: { authenticated: true, role: 'team' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '1 reply' }))
    expect(await screen.findByText('Noted, sharing with team')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Write a reply'), { target: { value: 'Done!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(calls('POST', '/notice-board/7/replies')).toHaveLength(1))
    expect(JSON.parse(calls('POST', '/notice-board/7/replies')[0][1].body)).toEqual({ body: 'Done!' })
  })

  it('admin sees who played and who did not', async () => {
    mockMe.mockReturnValue({ data: { authenticated: true, role: 'admin' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Played 1\/3/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Voice notice listeners' })
    expect(await within(dialog).findByText('Asha Team')).toBeInTheDocument()
    expect(within(dialog).getByText('1 of 3 members played it')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Not played (2)' }))
    expect(within(dialog).getByText('Neha Team')).toBeInTheDocument()
    expect(within(dialog).getByText('Ravi Leader')).toBeInTheDocument()

    // Admin listening doesn't count as a member play.
    fireEvent.click(screen.getByRole('button', { name: 'Play voice note' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls('POST', '/notice-board/7/played')).toHaveLength(0)
  })

  it('admin can switch the composer to voice mode', async () => {
    mockMe.mockReturnValue({ data: { authenticated: true, role: 'admin' } })
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: 'Voice' }))
    expect(screen.getByRole('button', { name: 'Send voice notice' })).toBeDisabled()
    expect(screen.getByLabelText('Voice notice caption')).toBeInTheDocument()
  })
})
