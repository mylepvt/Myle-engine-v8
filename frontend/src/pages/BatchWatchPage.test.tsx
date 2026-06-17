import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { BatchWatchPage } from '@/pages/BatchWatchPage'

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
      subtitle: 'Watch both videos inside Myle and submit your work from the same page.',
      lead_name: 'rahul sharma',
      youtube_url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be',
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: false,
      submission_enabled: true,
      submission: null,
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
    expect(screen.getByText('Post-batch upload')).toBeInTheDocument()
    expect(screen.getByText('Upload after this batch')).toBeInTheDocument()
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
      subtitle: 'Watch both videos inside Myle and submit your work from the same page.',
      lead_name: 'rahul sharma',
      youtube_url: 'https://cdn.myle.in/videos/day-2-morning.mp4?token=abc123',
      video_id: null,
      watch_complete: false,
      day2_evaluation_ready: true,
      submission_enabled: true,
      submission: {
        notes_url: '/uploads/batch_day_notes/11_d2_morning.jpg',
        voice_note_url: null,
        video_url: null,
        notes_text: 'Done with the main points.',
        submitted_at: '2026-04-21T12:00:00Z',
      },
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
    expect(screen.getByText('Latest upload for this batch')).toBeInTheDocument()
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
      submission_enabled: false,
      submission: null,
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
})
