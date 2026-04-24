import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { GateAssistantCard } from '@/components/dashboard/GateAssistantCard'

const mockUseDashboardShellRole = vi.fn()
const mockUseGateAssistantQuery = vi.fn()
const mockUseRequestMyGraceMutation = vi.fn()
const mockUseCancelMyGraceRequestMutation = vi.fn()

vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => mockUseDashboardShellRole(),
}))

vi.mock('@/hooks/use-gate-assistant-query', () => ({
  useGateAssistantQuery: () => mockUseGateAssistantQuery(),
}))

vi.mock('@/hooks/use-team-query', () => ({
  useRequestMyGraceMutation: () => mockUseRequestMyGraceMutation(),
  useCancelMyGraceRequestMutation: () => mockUseCancelMyGraceRequestMutation(),
}))

const baseResponse = {
  role: 'team' as const,
  risk_level: 'yellow' as const,
  progress_done: 1,
  progress_total: 2,
  next_action: "Submit today's daily report before the day closes.",
  next_href: 'other/daily-report',
  next_label: 'Open report',
  checklist: [
    {
      id: 'daily_call_target',
      label: "15 fresh calls on today's leads (8/15)",
      done: false,
      href: 'work/leads',
    },
    {
      id: 'daily_report_submitted',
      label: "Submit today's daily report",
      done: false,
      href: 'other/daily-report',
    },
  ],
  fresh_leads_today: 3,
  calls_today: 8,
  call_target: 15,
  pending_proof_count: 0,
  members_below_call_gate: 0,
  open_follow_ups: 0,
  overdue_follow_ups: 0,
  active_pipeline_leads: 0,
  compliance_level: 'clear',
  compliance_title: 'Clear',
  compliance_summary: 'No active discipline warning.',
  calls_short_streak: 0,
  missing_report_streak: 0,
  grace_active: false,
  grace_ending_tomorrow: false,
  grace_end_date: null,
  grace_request_pending: false,
  grace_request_end_date: null,
  grace_request_reason: null,
  team_warning_count: 0,
  team_strong_warning_count: 0,
  team_final_warning_count: 0,
  team_removed_count: 0,
  team_grace_count: 0,
  note: null,
}

function renderCard() {
  render(
    <MemoryRouter>
      <GateAssistantCard sessionReady />
    </MemoryRouter>,
  )
}

describe('GateAssistantCard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows grace request controls for team users', () => {
    mockUseDashboardShellRole.mockReturnValue({
      role: 'team',
      serverRole: 'team',
      isAdminPreviewing: false,
    })
    mockUseGateAssistantQuery.mockReturnValue({
      data: baseResponse,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseRequestMyGraceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
    mockUseCancelMyGraceRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })

    renderCard()

    expect(screen.getByText('Grace request')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request grace' })).toBeInTheDocument()
  })

  it('shows grace request controls for leaders too', () => {
    mockUseDashboardShellRole.mockReturnValue({
      role: 'leader',
      serverRole: 'leader',
      isAdminPreviewing: false,
    })
    mockUseGateAssistantQuery.mockReturnValue({
      data: {
        ...baseResponse,
        role: 'leader',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseRequestMyGraceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
    mockUseCancelMyGraceRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })

    renderCard()

    expect(screen.getByText('Grace request')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request grace' })).toBeInTheDocument()
  })

  it('shows pending request state when a grace request already exists', () => {
    mockUseDashboardShellRole.mockReturnValue({
      role: 'team',
      serverRole: 'team',
      isAdminPreviewing: false,
    })
    mockUseGateAssistantQuery.mockReturnValue({
      data: {
        ...baseResponse,
        grace_request_pending: true,
        grace_request_end_date: '2026-04-27',
        grace_request_reason: 'Family event',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseRequestMyGraceMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
    mockUseCancelMyGraceRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })

    renderCard()

    expect(screen.getByText('Grace request pending')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update request' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    expect(screen.getByText(/Family event/)).toBeInTheDocument()
  })
})
