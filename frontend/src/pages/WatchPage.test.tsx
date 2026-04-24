import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { WatchPage } from '@/pages/WatchPage'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('WatchPage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('marks video watched only after the playback reaches the end', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/watch/demo-token') && !init?.method) {
        return jsonResponse({
          token: 'demo-token',
          title: 'Enrollment video',
          lead_name: 'Rahul',
          masked_phone: '******0001',
          expires_at: '2026-04-24T12:30:00Z',
          access_granted: true,
          stream_url: '/api/v1/watch/demo-token/stream',
          watch_started: false,
          watch_completed: false,
          social_proof_count: 300,
          total_seats: 50,
          seats_left: 12,
          trust_note: 'Private room access is limited to the current batch window.',
        })
      }
      if (url.endsWith('/api/v1/watch/demo-token/play') && init?.method === 'POST') {
        return jsonResponse({ ok: true, watch_started: true, watch_completed: false })
      }
      if (url.endsWith('/api/v1/watch/demo-token/complete') && init?.method === 'POST') {
        return jsonResponse({ ok: true, watch_started: true, watch_completed: true })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    const { container } = render(
      <MemoryRouter initialEntries={['/watch/demo-token']}>
        <Routes>
          <Route path="/watch/:token" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Private in-app player')).toBeInTheDocument()
    })

    expect(screen.getByText('Current batch snapshot')).toBeInTheDocument()
    expect(screen.getByText('Forms received')).toBeInTheDocument()
    expect(screen.getByText('Batch seats')).toBeInTheDocument()
    expect(screen.getByText('Seats left')).toBeInTheDocument()
    expect(screen.getByText('Private room access is limited to the current batch window.')).toBeInTheDocument()

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    Object.defineProperty(video!, 'duration', { configurable: true, value: 120 })
    Object.defineProperty(video!, 'currentTime', { configurable: true, writable: true, value: 0 })

    fireEvent.loadedMetadata(video!)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    fireEvent.play(video!)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).endsWith('/api/v1/watch/demo-token/play') && init?.method === 'POST',
        ),
      ).toBe(true)
    })

    ;(video as HTMLVideoElement).currentTime = 60
    fireEvent.timeUpdate(video!)

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/v1/watch/demo-token/complete')),
    ).toBe(false)

    ;(video as HTMLVideoElement).currentTime = 120
    fireEvent.ended(video!)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).endsWith('/api/v1/watch/demo-token/complete') && init?.method === 'POST',
        ),
      ).toBe(true)
    })

    expect(await screen.findByText('Video completed')).toBeInTheDocument()
    expect(
      screen.getByText('Playback completion recorded. Team room se bahar aapka next status manually handle karegi.'),
    ).toBeInTheDocument()
  })

  it('keeps the player non-seekable and hides native skip controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        token: 'demo-token',
        title: 'Enrollment video',
        lead_name: 'Rahul',
        masked_phone: '******0001',
        expires_at: '2026-04-24T12:30:00Z',
        access_granted: true,
        stream_url: '/api/v1/watch/demo-token/stream',
        watch_started: false,
        watch_completed: false,
        social_proof_count: null,
        total_seats: null,
        seats_left: null,
        trust_note: null,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <MemoryRouter initialEntries={['/watch/demo-token']}>
        <Routes>
          <Route path="/watch/:token" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Private in-app player')).toBeInTheDocument()
    })

    const video = container.querySelector('video') as HTMLVideoElement | null
    expect(video).not.toBeNull()
    expect(video?.controls).toBe(false)
    expect(
      screen.getByText(
        'Skipping is disabled. Playback completion alag se track hoti hai, aur team next step status ke hisab se handle karti hai.',
      ),
    ).toBeInTheDocument()

    Object.defineProperty(video!, 'duration', { configurable: true, value: 120 })
    Object.defineProperty(video!, 'currentTime', { configurable: true, writable: true, value: 0 })

    fireEvent.loadedMetadata(video!)
    video!.currentTime = 15
    fireEvent.timeUpdate(video!)
    video!.currentTime = 60
    fireEvent.seeking(video!)

    expect(video!.currentTime).toBe(15)
  })
})
