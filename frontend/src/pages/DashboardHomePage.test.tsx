import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { DashboardHomePage } from '@/pages/DashboardHomePage'

const mockUseDashboardShellRole = vi.fn()
const mockUseAuthMeQuery = vi.fn()
const mockUseWorkboardQuery = vi.fn()
const mockUseFollowUpsQuery = vi.fn()
const mockUseTeamPersonalFunnelQuery = vi.fn()
const mockUseTeamTodayStatsQuery = vi.fn()
const mockUseLeadPoolQuery = vi.fn()
const mockUseTeamReportsQuery = vi.fn()
const mockUsePingLoginMutation = vi.fn()
const mockUseXpMeQuery = vi.fn()
const mockUseXpHistoryQuery = vi.fn()
const mockUseXpLeaderboardQuery = vi.fn()
const mockUsePatchLeadMutation = vi.fn()
const mockAdminCommandCenter = vi.fn()

vi.mock('@/components/dashboard/GateAssistantCard', () => ({
  GateAssistantCard: () => <div data-testid="gate-assistant">Gate Assistant</div>,
}))

vi.mock('@/components/dashboard/AdminCommandCenter', () => ({
  AdminCommandCenter: (props: { firstName: string }) => {
    mockAdminCommandCenter(props)
    return <div data-testid="admin-command-center">{props.firstName}</div>
  },
}))

vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => mockUseDashboardShellRole(),
}))

vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => mockUseAuthMeQuery(),
}))

vi.mock('@/hooks/use-workboard-query', () => ({
  useWorkboardQuery: () => mockUseWorkboardQuery(),
}))

vi.mock('@/hooks/use-follow-ups-query', () => ({
  useFollowUpsQuery: () => mockUseFollowUpsQuery(),
}))

vi.mock('@/hooks/use-team-personal-funnel-query', () => ({
  useTeamPersonalFunnelQuery: () => mockUseTeamPersonalFunnelQuery(),
}))

vi.mock('@/hooks/use-team-today-stats-query', () => ({
  useTeamTodayStatsQuery: () => mockUseTeamTodayStatsQuery(),
}))

vi.mock('@/hooks/use-lead-pool-query', () => ({
  useLeadPoolQuery: () => mockUseLeadPoolQuery(),
}))

vi.mock('@/hooks/use-team-reports-query', () => ({
  useTeamReportsQuery: () => mockUseTeamReportsQuery(),
}))

vi.mock('@/hooks/use-xp-query', () => ({
  usePingLoginMutation: () => mockUsePingLoginMutation(),
  useXpMeQuery: () => mockUseXpMeQuery(),
  useXpHistoryQuery: () => mockUseXpHistoryQuery(),
  useXpLeaderboardQuery: () => mockUseXpLeaderboardQuery(),
  LEVEL_COLORS: {
    rookie: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-500/30' },
  },
}))

vi.mock('@/hooks/use-leads-query', () => ({
  LEAD_STATUS_OPTIONS: [],
  usePatchLeadMutation: () => mockUsePatchLeadMutation(),
}))

function seedBaseMocks(role: 'team' | 'leader' | 'admin') {
  mockUseDashboardShellRole.mockReturnValue({
    role,
    serverRole: role,
    isAdminPreviewing: false,
  })
  mockUseAuthMeQuery.mockReturnValue({
    data: {
      authenticated: true,
      username:
        role === 'team' ? 'Team User' : role === 'leader' ? 'Leader User' : 'Admin User',
      fbo_id:
        role === 'team' ? 'fbo-team-001' : role === 'leader' ? 'fbo-leader-001' : 'fbo-admin-001',
      email:
        role === 'team' ? 'team@myle.local' : role === 'leader' ? 'leader@myle.local' : 'admin@myle.local',
    },
    isPending: false,
  })
  mockUseWorkboardQuery.mockReturnValue({
    data: { columns: [] },
    isPending: false,
    isError: false,
  })
  mockUseFollowUpsQuery.mockReturnValue({
    data: { total: 0 },
    isPending: false,
    isError: false,
  })
  mockUseTeamPersonalFunnelQuery.mockReturnValue({
    data: {
      claimed: 0,
      video_reached: 0,
      proof_pending: 0,
      paid_196: 0,
    },
    isPending: false,
    isError: false,
  })
  mockUseTeamTodayStatsQuery.mockReturnValue({
    data: {
      claimed_today: 0,
      calls_today: 0,
      enrolled_today: 0,
    },
    isPending: false,
  })
  mockUseLeadPoolQuery.mockReturnValue({
    data: { total: 0 },
    isPending: false,
  })
  mockUseTeamReportsQuery.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
  })
  mockUsePingLoginMutation.mockReturnValue({
    mutate: vi.fn(),
  })
  mockUseXpMeQuery.mockReturnValue({
    data: {
      xp_total: 0,
      level: 'rookie',
      level_label: 'Rookie',
      daily_xp: 0,
      daily_cap: 300,
      streak: 0,
      next_level_xp: 300,
      progress_pct: 0,
      season_year: 2026,
      season_month: 4,
    },
    isPending: false,
    isError: false,
  })
  mockUseXpHistoryQuery.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  })
  mockUseXpLeaderboardQuery.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  })
  mockUsePatchLeadMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  })
}

describe('DashboardHomePage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Gate Assistant on the team dashboard path', () => {
    seedBaseMocks('team')

    render(
      <MemoryRouter>
        <DashboardHomePage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('gate-assistant')).toBeInTheDocument()
  })

  it('renders Gate Assistant on the leader dashboard path', () => {
    seedBaseMocks('leader')

    render(
      <MemoryRouter>
        <DashboardHomePage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('gate-assistant')).toBeInTheDocument()
  })

  it('routes admin home to the command center surface', () => {
    seedBaseMocks('admin')

    render(
      <MemoryRouter>
        <DashboardHomePage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('admin-command-center')).toBeInTheDocument()
    expect(mockAdminCommandCenter).toHaveBeenCalledWith({ firstName: 'Admin' })
  })
})
