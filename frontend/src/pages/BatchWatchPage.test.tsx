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

  it('renders personalized greeting and only loads the iframe after play is tapped', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
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
      expect(screen.getByText('Good Morning Rahul')).toBeInTheDocument()
    })

    const playerHeading = screen.getByText('In-app player')
    const greeting = screen.getByText('Good Morning Rahul')

    expect(screen.getByText('Your Day 2 Morning Batch is ready')).toBeInTheDocument()
    expect(screen.getByText('Reserved for Rahul')).toBeInTheDocument()
    expect(screen.getByText('Tap play to start the batch inside Myle without showing external video clutter before the session begins.')).toBeInTheDocument()
    expect(screen.getByText('Post-batch upload')).toBeInTheDocument()
    expect(screen.getByText('Upload after this batch')).toBeInTheDocument()
    expect(screen.getByText('Business evaluation stays separate')).toBeInTheDocument()
    expect(screen.getByText('Unlocks after the 3rd Day 2 batch')).toBeInTheDocument()
    expect(playerHeading.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTitle('Day 2 Morning Batch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start batch now' }))

    const iframe = await screen.findByTitle('Day 2 Morning Batch')
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&autoplay=1',
    )
  })

  it('uses the native video player for direct hosted video files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
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
      expect(screen.getByText('Good Morning Rahul')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start batch now' }))

    await waitFor(() => {
      expect(container.querySelector('video[title="Day 2 Morning Batch"]')).not.toBeNull()
    })

    const video = container.querySelector('video[title="Day 2 Morning Batch"]')
    expect(video?.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('src', 'https://cdn.myle.in/videos/day-2-morning.mp4?token=abc123')
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.getByText('Playback stays inside Myle with native controls and fullscreen available from the player.')).toBeInTheDocument()
    expect(screen.getByText('Latest upload for this batch')).toBeInTheDocument()
    expect(screen.getByText('Ready for old test link flow')).toBeInTheDocument()
  })
})
