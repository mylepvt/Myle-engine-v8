import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { AdminCommandCenter } from '@/components/dashboard/AdminCommandCenter'

const mockUseQuery = vi.fn()
const mockUseActiveWatchersQuery = vi.fn()
const mockUseAppSettingsQuery = vi.fn()
const mockUseSystemUsersSummaryQuery = vi.fn()
const mockUseDay2ReviewQuery = vi.fn()
const mockUseEnrollmentApprovalsPendingQuery = vi.fn()
const mockUseTeamMembersQuery = vi.fn()
const mockUseTeamReportsQuery = vi.fn()
const mockUseWalletRechargeRequestsQuery = vi.fn()
const mockUseInvoicesQuery = vi.fn()
const mockUseLeadControlQuery = vi.fn()
const mockUseLeadsQuery = vi.fn()
const mockUseLeadPoolQuery = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (...args: Parameters<typeof actual.useQuery>) => mockUseQuery(...args),
  }
})

vi.mock('@/hooks/use-settings-query', () => ({
  useAppSettingsQuery: (...args: unknown[]) => mockUseAppSettingsQuery(...args),
  useSystemUsersSummaryQuery: (...args: unknown[]) => mockUseSystemUsersSummaryQuery(...args),
}))

vi.mock('@/hooks/use-enroll-query', () => ({
  useActiveWatchersQuery: (...args: unknown[]) => mockUseActiveWatchersQuery(...args),
}))

vi.mock('@/hooks/use-day2-review-query', () => ({
  useDay2ReviewQuery: (...args: unknown[]) => mockUseDay2ReviewQuery(...args),
}))

vi.mock('@/hooks/use-team-query', () => ({
  useEnrollmentApprovalsPendingQuery: (...args: unknown[]) => mockUseEnrollmentApprovalsPendingQuery(...args),
  useTeamMembersQuery: (...args: unknown[]) => mockUseTeamMembersQuery(...args),
}))

vi.mock('@/hooks/use-team-reports-query', () => ({
  useTeamReportsQuery: (...args: unknown[]) => mockUseTeamReportsQuery(...args),
}))

vi.mock('@/hooks/use-wallet-recharge-query', () => ({
  useWalletRechargeRequestsQuery: (...args: unknown[]) => mockUseWalletRechargeRequestsQuery(...args),
}))

vi.mock('@/hooks/use-invoices-query', () => ({
  useInvoicesQuery: (...args: unknown[]) => mockUseInvoicesQuery(...args),
}))

vi.mock('@/hooks/use-lead-control-query', () => ({
  useLeadControlQuery: (...args: unknown[]) => mockUseLeadControlQuery(...args),
}))

vi.mock('@/hooks/use-lead-pool-query', () => ({
  useLeadPoolQuery: (...args: unknown[]) => mockUseLeadPoolQuery(...args),
}))

vi.mock('@/hooks/use-leads-query', () => ({
  LEAD_STATUS_OPTIONS: [
    { value: 'video_sent', label: 'Sent Enroll Video' },
    { value: 'video_watched', label: 'Video Watched' },
    { value: 'day2', label: 'Day 2' },
  ],
  useLeadsQuery: (...args: unknown[]) => mockUseLeadsQuery(...args),
}))

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminCommandCenter firstName="Admin" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminCommandCenter', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the admin today desk, universal search, and audit preview', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'team') {
        return {
          data: { total: 2, items: [] },
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      return {
        data: {
          grand_totals: {
            current_balance_cents: 125000,
            period_recharge_cents: 45000,
            period_spend_cents: 15000,
            period_net_change_cents: 30000,
          },
          note: 'Month snapshot',
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }
    })
    mockUseEnrollmentApprovalsPendingQuery.mockReturnValue({
      data: { total: 3, items: [] },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseWalletRechargeRequestsQuery.mockReturnValue({
      data: {
        total: 2,
        items: [
          {
            id: 1,
            user_id: 9,
            member_name: 'Finance Team',
            amount_cents: 5000,
            status: 'pending',
            admin_note: null,
            reviewed_by_user_id: null,
            reviewed_at: null,
            created_at: '2026-04-25T06:30:00Z',
            utr_number: null,
            proof_url: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
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
            assigned_to_user_id: 5,
            assigned_to_name: 'Current Assignee',
            archived_at: '2026-04-25T04:00:00Z',
            watch_completed_at: '2026-04-24T04:00:00Z',
            last_action_at: '2026-04-24T04:00:00Z',
          },
        ],
        incubation_total: 1,
        incubation_queue: [
          {
            lead_id: 14,
            lead_name: 'Archived Watch Lead',
            phone: '9888888888',
            status: 'video_watched',
            owner_user_id: 3,
            owner_name: 'Team User',
            assigned_to_user_id: 5,
            assigned_to_name: 'Current Assignee',
            archived_at: '2026-04-25T08:00:00Z',
            watch_completed_at: '2026-04-24T08:00:00Z',
            last_action_at: '2026-04-24T08:00:00Z',
          },
        ],
        assignable_users: [],
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
            previous_assignee_user_id: 5,
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
    mockUseLeadPoolQuery.mockReturnValue({
      data: { total: 24, items: [] },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseTeamReportsQuery.mockReturnValue({
      data: {
        live_summary: {
          leads_claimed_today: 12,
          calls_made_today: 41,
          enrolled_today: 4,
          payment_proofs_approved_today: 3,
          day1_total: 8,
          day2_total: 6,
          converted_total: 2,
        },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseActiveWatchersQuery.mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            lead_id: 91,
            lead_name: 'Watching Prospect',
            viewer_name: 'Watching Prospect',
            viewer_phone: '9876543210',
            unlocked_at: '2026-04-25T05:00:00Z',
            started_at: '2026-04-25T05:00:00Z',
            last_seen_at: '2026-04-25T05:05:00Z',
            watch_completed: false,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseSystemUsersSummaryQuery.mockReturnValue({
      data: {
        total_users: 40,
        by_role: { leader: 6, team: 28 },
        by_status: { approved: 34 },
        blocked_users: 2,
        by_training_status: { required: 3 },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseTeamMembersQuery.mockReturnValue({
      data: {
        total: 2,
        items: [
          {
            id: 17,
            name: 'Training Locked User',
            fbo_id: 'fbo-team-017',
            role: 'team',
            email: 'locked@example.com',
            access_blocked: false,
            training_required: true,
            compliance_level: 'warning',
            compliance_title: 'Docs pending',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseInvoicesQuery.mockReturnValue({
      data: {
        total: 1,
        items: [
          {
            invoice_number: 'INV-001',
            doc_type: 'tax_invoice',
            user_id: 7,
            member_name: 'Fresh Team',
            member_username: 'fresh_team',
            total_cents: 19600,
            currency: 'INR',
            issued_at: '2026-04-25T07:00:00Z',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseAppSettingsQuery.mockReturnValue({
      data: {
        settings: {
          enrollment_video_source_url: 'https://videos.example.com/enrollment.mp4',
          enrollment_video_title: 'Enrollment Room',
          public_app_url: 'https://app.example.com',
          live_session_url: 'https://zoom.us/live-room',
          batch_day1_url: 'https://app.example.com/day1',
        },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
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
    mockUseLeadsQuery.mockReturnValue({
      data: {
        total: 1,
        limit: 50,
        offset: 0,
        items: [
          {
            id: 22,
            name: 'Search Match Lead',
            status: 'day2',
            created_by_user_id: 1,
            owner_user_id: 3,
            owner_name: 'Team User',
            created_at: '2026-04-25T02:00:00Z',
            archived_at: null,
            deleted_at: null,
            in_pool: false,
            pool_price_cents: null,
            phone: '9000000000',
            email: null,
            city: 'Jaipur',
            age: null,
            gender: null,
            ad_name: null,
            source: null,
            notes: null,
            assigned_to_user_id: 7,
            assigned_to_name: 'Fresh Team',
            call_status: null,
            call_count: 0,
            last_called_at: null,
            whatsapp_sent_at: null,
            payment_status: null,
            payment_amount_cents: null,
            payment_proof_url: null,
            payment_proof_uploaded_at: null,
            day1_completed_at: null,
            day2_completed_at: null,
            day3_completed_at: null,
            d1_morning: false,
            d1_afternoon: false,
            d1_evening: false,
            d2_morning: false,
            d2_afternoon: false,
            d2_evening: false,
            no_response_attempt_count: 0,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderWithProviders()

    expect(screen.getByText('Admin Command Center')).toBeInTheDocument()
    expect(screen.getByText('Today Queue')).toBeInTheDocument()
    expect(screen.getByText('Live Right Now')).toBeInTheDocument()
    expect(screen.getByText('Watching Prospect')).toBeInTheDocument()
    expect(screen.getByText('Reassign Ready')).toBeInTheDocument()
    expect(screen.getByText('Archive Incubation')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audit' })).toBeInTheDocument()
    expect(screen.getByText('Open lead control')).toBeInTheDocument()
    expect(screen.getByText('Open Day 2 review')).toBeInTheDocument()
  })
})
