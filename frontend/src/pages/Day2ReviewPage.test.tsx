import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Day2ReviewPage } from '@/pages/Day2ReviewPage'

const mockUseDay2ReviewQuery = vi.fn()

vi.mock('@/hooks/use-day2-review-query', () => ({
  useDay2ReviewQuery: () => mockUseDay2ReviewQuery(),
}))

describe('Day2ReviewPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the dedicated Day 2 admin review wall', () => {
    mockUseDay2ReviewQuery.mockReturnValue({
      data: {
        note: 'Admin-only Day 2 review surface.',
        total: 1,
        notes_count: 1,
        voice_count: 1,
        video_count: 1,
        submissions: [
          {
            submission_id: 11,
            lead_id: 9,
            lead_name: 'Queued Watch Lead',
            slot: 'd2_morning',
            submitted_at: '2026-04-25T05:15:00Z',
            assigned_to_user_id: 7,
            assigned_to_name: 'Fresh Team',
            owner_user_id: 3,
            owner_name: 'Team User',
            notes_text_preview: 'Shared Day 2 notes for admin review.',
            notes_url: '/uploads/day2-note.pdf',
            voice_note_url: '/uploads/day2-voice.m4a',
            video_url: '/uploads/day2-video.mp4',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Day2ReviewPage title="Day 2 Review" />
      </MemoryRouter>,
    )

    expect(screen.getByText('Review Wall')).toBeInTheDocument()
    expect(screen.getByText('Queued Watch Lead')).toBeInTheDocument()
    expect(screen.getByText('Shared Day 2 notes for admin review.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /notes file/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voice note/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^video$/i })).toBeInTheDocument()
  })
})
