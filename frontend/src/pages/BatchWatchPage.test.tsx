import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { BatchWatchPage } from '@/pages/BatchWatchPage'

// Under a busy parallel run (CI) these waits took 1.04–1.13 s, just past the
// 1 s default, and flaked. Give them headroom.
configure({ asyncUtilTimeout: 5000 })

describe('BatchWatchPage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders a video-first layout and only loads the iframe after play is tapped', async () => {
    const payload = {
      token: 'demo-token',
      slot: 'd2_morning',
      version: 1,
      day_number: 2,
      slot_label: 'Morning',
      title: 'Day 2 Morning Batch',
      subtitle: 'Watch both videos inside Myle.',
      lead_name: 'rahul sharma',
      youtube_url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be',
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: false,
      verified: true,
    }
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/watch/batch/d2_morning/1?token=demo-token']}>
        <Routes>
          <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Your Day 2 Morning Batch is ready')).toBeInTheDocument()
    })

    expect(screen.getByText('Tap play to watch this video inside Myle.')).toBeInTheDocument()
    expect(screen.queryByTitle('Day 2 Morning Batch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))

    const iframe = await screen.findByTitle('Day 2 Morning Batch')
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&autoplay=1',
    )
  })

  it('uses the native video player for direct hosted video files', async () => {
    const payload = {
      token: 'demo-token',
      slot: 'd2_morning',
      version: 1,
      day_number: 2,
      slot_label: 'Morning',
      title: 'Day 2 Morning Batch',
      subtitle: 'Watch both videos inside Myle.',
      lead_name: 'rahul sharma',
      youtube_url: 'https://cdn.myle.in/videos/day-2-morning.mp4?token=abc123',
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: true,
      verified: true,
    }
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <MemoryRouter initialEntries={['/watch/batch/d2_morning/1?token=demo-token']}>
        <Routes>
          <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Your Day 2 Morning Batch is ready')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))

    await waitFor(() => {
      expect(container.querySelector('video[title="Day 2 Morning Batch"]')).not.toBeNull()
    })

    const video = container.querySelector('video[title="Day 2 Morning Batch"]')
    expect(video?.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('src', 'https://cdn.myle.in/videos/day-2-morning.mp4?token=abc123')
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.getByText('Playback stays inside Myle with native controls and fullscreen available from the player.')).toBeInTheDocument()
  })

  it('shows a locked state before the scheduled slot opens', async () => {
    const payload = {
      token: 'demo-token',
      slot: 'd1_evening',
      version: 1,
      day_number: 1,
      slot_label: 'Evening',
      title: 'Day 1 Evening Batch',
      subtitle: 'Watch inside Myle.',
      lead_name: 'rahul sharma',
      access_open: false,
      opens_at: '2099-12-31T13:30:00Z',
      gate_message: 'This evening batch unlocks at 07:00 PM IST. Please come back at your scheduled batch time.',
      youtube_url: null,
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: false,
      verified: true,
    }
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/watch/batch/d1_evening/1?token=demo-token']}>
        <Routes>
          <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('This room is locked for now')).toBeInTheDocument()
    })

    expect(screen.getByText(/unlocks at 07:00 PM IST/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send selected video' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I watched this' })).not.toBeInTheDocument()
  })

  it('hides the video until the lead enters their own mobile number', async () => {
    const base = {
      token: 'demo-token',
      slot: 'd1_morning',
      version: 1,
      day_number: 1,
      slot_label: 'Morning',
      title: 'Day 1 Morning Batch',
      subtitle: 'Watch your batch inside Myle.',
      lead_name: 'rahul',
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: false,
      phone_hint: '*******210',
      expires_at: null,
    }
    let unlocked = false
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/unlock')) {
        const phone = JSON.parse(String(init?.body)).phone as string
        if (phone !== '9876543210') {
          return json({ error: { message: 'Enter the mobile number this link was sent to.' } }, 403)
        }
        unlocked = true
        return json({ ok: true })
      }
      if (url.includes('/payload')) {
        return json(
          unlocked
            ? { ...base, verified: true, youtube_url: 'https://youtu.be/dQw4w9WgXcQ' }
            : { ...base, verified: false, youtube_url: null },
        )
      }
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/watch/batch/d1_morning/1?token=demo-token']}>
        <Routes>
          <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText("Confirm it's you")
    expect(screen.getByText(/\*\*\*\*\*\*\*210/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/heartbeat'))).toBe(false)

    fireEvent.change(screen.getByPlaceholderText('Mobile number'), { target: { value: '9000000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open video' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the mobile number this link was sent to.')

    fireEvent.change(screen.getByPlaceholderText('Mobile number'), { target: { value: '9876543210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open video' }))
    expect(await screen.findByRole('button', { name: 'Play video' })).toBeInTheDocument()
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument()
  })
})
