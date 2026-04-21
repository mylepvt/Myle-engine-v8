import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { BatchWatchPage } from '@/pages/BatchWatchPage'

describe('BatchWatchPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders personalized greeting and in-app iframe player for batch rooms', async () => {
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
          youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          video_id: 'dQw4w9WgXcQ',
          watch_complete: false,
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
    expect(screen.getByText(/Video plays inside Myle/i)).toBeInTheDocument()
    expect(playerHeading.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const iframe = screen.getByTitle('Day 2 Morning Batch')
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&autoplay=1',
    )
  })
})
