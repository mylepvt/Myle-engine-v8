import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'

import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'

const mockUseAuthMeQuery = vi.fn()
const mockUseDashboardShellRole = vi.fn()

vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => mockUseAuthMeQuery(),
}))

vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => mockUseDashboardShellRole(),
}))

vi.mock('@/hooks/use-training-query', () => ({
  useDownloadCertificateMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useMarkTrainingDayMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useUploadTrainingNotesMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useUpdateTrainingDayMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUploadTrainingAudioMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/lib/auth-api', () => ({
  authSyncIdentity: vi.fn().mockResolvedValue(undefined),
}))

const baseData = {
  videos: [
    {
      day_number: 1,
      title: 'Day 1 - Welcome',
      has_video: false,
      audio_url: null,
      unlocked: true,
    },
  ],
  progress: [],
  notes: [],
  note: null,
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <TrainingProgramPanel data={baseData} />
    </QueryClientProvider>,
  )
}

describe('TrainingProgramPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hides the admin editor for real team users', () => {
    mockUseAuthMeQuery.mockReturnValue({
      data: { training_status: 'pending' },
    })
    mockUseDashboardShellRole.mockReturnValue({
      role: 'team',
      serverRole: 'team',
      isAdminPreviewing: false,
    })

    renderPanel()

    expect(screen.queryByText('Admin editor')).not.toBeInTheDocument()
  })

  it('hides the admin editor while admin is previewing another role', () => {
    mockUseAuthMeQuery.mockReturnValue({
      data: { training_status: 'pending' },
    })
    mockUseDashboardShellRole.mockReturnValue({
      role: 'team',
      serverRole: 'admin',
      isAdminPreviewing: true,
    })

    renderPanel()

    expect(screen.queryByText('Admin editor')).not.toBeInTheDocument()
  })

  it('shows the admin editor only for real admin mode', () => {
    mockUseAuthMeQuery.mockReturnValue({
      data: { training_status: 'pending' },
    })
    mockUseDashboardShellRole.mockReturnValue({
      role: 'admin',
      serverRole: 'admin',
      isAdminPreviewing: false,
    })

    renderPanel()

    expect(screen.getByText('Admin editor')).toBeInTheDocument()
  })
})
