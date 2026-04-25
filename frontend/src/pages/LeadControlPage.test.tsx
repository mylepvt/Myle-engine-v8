import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LeadControlPage } from '@/pages/LeadControlPage'

const mockUseLeadControlQuery = vi.fn()
const mockMutateAsync = vi.fn()
const mockUseLeadControlManualReassignMutation = vi.fn()

vi.mock('@/hooks/use-lead-control-query', () => ({
  useLeadControlQuery: () => mockUseLeadControlQuery(),
  useLeadControlManualReassignMutation: () => mockUseLeadControlManualReassignMutation(),
}))

vi.mock('@/hooks/use-leads-query', () => ({
  LEAD_STATUS_OPTIONS: [
    { value: 'video_sent', label: 'Sent Enroll Video' },
    { value: 'video_watched', label: 'Video Watched' },
  ],
}))

describe('LeadControlPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the admin queue, history, and day 2 review wall', () => {
    mockUseLeadControlQuery.mockReturnValue({
      data: {
        note: 'Admin-only control surface.',
        queue_total: 1,
        queue: [
          {
            lead_id: 9,
            lead_name: 'Queued Watch Lead',
            phone: '9777777777',
            status: 'video_sent',
            owner_user_id: 3,
            owner_name: 'Team User',
            assigned_to_user_id: 3,
            assigned_to_name: 'Current Assignee',
            archived_at: '2026-04-25T04:00:00Z',
            watch_completed_at: '2026-04-24T04:00:00Z',
            last_action_at: '2026-04-24T04:00:00Z',
          },
        ],
        assignable_users: [
          {
            user_id: 7,
            display_name: 'Fresh Team',
            role: 'team',
            fbo_id: 'fbo-team-007',
            username: 'fresh_team',
            active_leads_count: 6,
            xp_total: 400,
          },
        ],
        history_total: 1,
        history_summary: [
          {
            user_id: 7,
            display_name: 'Fresh Team',
            role: 'team',
            total_received: 1,
            manual_received: 1,
            auto_received: 0,
            last_received_at: '2026-04-25T05:00:00Z',
          },
        ],
        history: [
          {
            activity_id: 1,
            occurred_at: '2026-04-25T05:00:00Z',
            mode: 'manual',
            lead_id: 9,
            lead_name: 'Queued Watch Lead',
            previous_assignee_user_id: 3,
            previous_assignee_name: 'Current Assignee',
            assigned_to_user_id: 7,
            assigned_to_name: 'Fresh Team',
            owner_user_id: 3,
            owner_name: 'Team User',
            actor_name: 'Admin',
            reason: 'Fresh follow-up',
          },
        ],
        day2_total: 1,
        day2_submissions: [
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
    mockUseLeadControlManualReassignMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })

    render(
      <MemoryRouter>
        <LeadControlPage title="Lead Control" />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('Queued Watch Lead').length).toBeGreaterThan(0)
    expect(screen.getByText('Reassignment Queue')).toBeInTheDocument()
    expect(screen.getByText('Day 2 Review Wall')).toBeInTheDocument()
    expect(screen.getByText('Shared Day 2 notes for admin review.')).toBeInTheDocument()
    expect(screen.getAllByText('Fresh Team').length).toBeGreaterThan(0)
  })

  it('submits a manual reassignment from the selected queue lead', async () => {
    mockUseLeadControlQuery.mockReturnValue({
      data: {
        note: 'Admin-only control surface.',
        queue_total: 1,
        queue: [
          {
            lead_id: 9,
            lead_name: 'Queued Watch Lead',
            phone: '9777777777',
            status: 'video_sent',
            owner_user_id: 3,
            owner_name: 'Team User',
            assigned_to_user_id: 3,
            assigned_to_name: 'Current Assignee',
            archived_at: '2026-04-25T04:00:00Z',
            watch_completed_at: '2026-04-24T04:00:00Z',
            last_action_at: '2026-04-24T04:00:00Z',
          },
        ],
        assignable_users: [
          {
            user_id: 7,
            display_name: 'Fresh Team',
            role: 'team',
            fbo_id: 'fbo-team-007',
            username: 'fresh_team',
            active_leads_count: 6,
            xp_total: 400,
          },
        ],
        history_total: 0,
        history_summary: [],
        history: [],
        day2_total: 0,
        day2_submissions: [],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockMutateAsync.mockResolvedValue({
      success: true,
      message: 'Lead reassigned successfully.',
      lead_id: 9,
      previous_assignee_user_id: 3,
      previous_assignee_name: 'Current Assignee',
      assigned_to_user_id: 7,
      assigned_to_name: 'Fresh Team',
      owner_user_id: 3,
      owner_name: 'Team User',
    })
    mockUseLeadControlManualReassignMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    })

    render(
      <MemoryRouter>
        <LeadControlPage title="Lead Control" />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Why are you manually moving this lead?'), {
      target: { value: 'Fresh follow-up needed.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reassign lead' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        leadId: 9,
        toUserId: 7,
        reason: 'Fresh follow-up needed.',
      })
    })
  })
})
