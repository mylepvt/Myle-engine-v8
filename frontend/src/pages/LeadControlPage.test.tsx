import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LeadControlPage } from '@/pages/LeadControlPage'

const mockUseLeadControlQuery = vi.fn()
const mockMutateAsync = vi.fn()
const mockBulkMutateAsync = vi.fn()
const mockUseLeadControlManualReassignMutation = vi.fn()
const mockUseLeadControlBulkReassignMutation = vi.fn()

vi.mock('@/hooks/use-lead-control-query', () => ({
  useLeadControlQuery: () => mockUseLeadControlQuery(),
  useLeadControlManualReassignMutation: () => mockUseLeadControlManualReassignMutation(),
  useLeadControlBulkReassignMutation: () => mockUseLeadControlBulkReassignMutation(),
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

  it('renders the admin queue and reassignment history', () => {
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
    mockUseLeadControlBulkReassignMutation.mockReturnValue({
      mutateAsync: mockBulkMutateAsync,
      isPending: false,
    })

    render(
      <MemoryRouter>
        <LeadControlPage title="Lead Control" />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('Queued Watch Lead').length).toBeGreaterThan(0)
    expect(screen.getByText('Reassignment Queue')).toBeInTheDocument()
    expect(screen.getByText('Recent Reassignment Log')).toBeInTheDocument()
    expect(screen.getByText('Day 2 Review')).toBeInTheDocument()
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
    mockUseLeadControlBulkReassignMutation.mockReturnValue({
      mutateAsync: mockBulkMutateAsync,
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

  it('submits a bulk reassignment only from selected stale queue leads', async () => {
    mockUseLeadControlQuery.mockReturnValue({
      data: {
        note: 'Admin-only control surface.',
        queue_total: 2,
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
          {
            lead_id: 10,
            lead_name: 'Second Queued Watch Lead',
            phone: '9888888888',
            status: 'video_watched',
            owner_user_id: 3,
            owner_name: 'Team User',
            assigned_to_user_id: 5,
            assigned_to_name: 'Another Assignee',
            archived_at: '2026-04-25T03:00:00Z',
            watch_completed_at: '2026-04-24T03:00:00Z',
            last_action_at: '2026-04-24T03:00:00Z',
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
    mockBulkMutateAsync.mockResolvedValue({
      success: true,
      message: '2 stale archived completed-watch lead(s) reassigned successfully. Owners stayed unchanged.',
      reassigned_count: 2,
      lead_ids: [9, 10],
      assigned_to_user_id: 7,
      assigned_to_name: 'Fresh Team',
    })
    mockUseLeadControlBulkReassignMutation.mockReturnValue({
      mutateAsync: mockBulkMutateAsync,
      isPending: false,
    })

    render(
      <MemoryRouter>
        <LeadControlPage title="Lead Control" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByLabelText('Select Queued Watch Lead'))
    fireEvent.click(screen.getByLabelText('Select Second Queued Watch Lead'))
    fireEvent.change(screen.getByPlaceholderText('Why are you manually moving this lead?'), {
      target: { value: 'Bulk cleanup.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reassign 2 leads' }))

    await waitFor(() => {
      expect(mockBulkMutateAsync).toHaveBeenCalledWith({
        leadIds: [9, 10],
        toUserId: 7,
        reason: 'Bulk cleanup.',
      })
    })
  })
})
