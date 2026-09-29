import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TrainingHubPage } from '@/pages/TrainingHubPage'
import type { SkillTrainingSurface } from '@/hooks/use-skills-training-query'

const mockMe = vi.fn()
const mockSkills = vi.fn()

vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => mockMe(),
}))

vi.mock('@/hooks/use-system-surface-query', () => ({
  useSystemSurfaceQuery: () => ({
    data: { videos: [{ day_number: 1, title: 'Welcome' }], progress: [{ day_number: 1, completed: true }] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/components/training/TrainingProgramPanel', () => ({
  TrainingProgramPanel: () => <div>onboarding-panel</div>,
}))

vi.mock('@/hooks/use-skills-training-query', () => ({
  skillDayEmbedUrl: (n: number) => `/embed/${n}`,
  useSkillsTrainingQuery: () => mockSkills(),
  useSkillsTrainingProgressQuery: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMarkSkillDayDoneMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSkillDayMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function skills(overrides: Partial<SkillTrainingSurface>) {
  return {
    data: { available: true, total_days: 0, completed_days: 0, days: [], ...overrides },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }
}

const lessons = [
  { day_number: 1, title: 'Time management', has_video: true, youtube_url: null, unlocked: true, unlocks_on: null, completed: false, completed_at: null },
  { day_number: 2, title: 'Communication', has_video: true, youtube_url: null, unlocked: false, unlocks_on: '2026-09-30', completed: false, completed_at: null },
]

describe('TrainingHubPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  beforeEach(() => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: true, training_status: 'pending' } })
  })

  it('during onboarding: onboarding open, skills collapsed and locked', () => {
    mockSkills.mockReturnValue(skills({ available: false }))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('onboarding-panel')).toBeTruthy()
    expect(screen.getByText('Unlocks after onboarding')).toBeTruthy()
    expect(screen.queryByText('Opens after onboarding')).toBeNull()
  })

  it('after unlock: onboarding collapsed, skills open on the next lesson', () => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: false, training_status: 'completed' } })
    mockSkills.mockReturnValue(skills({ total_days: 2, days: lessons }))
    render(<TrainingHubPage title="Training" />)
    expect(screen.queryByText('onboarding-panel')).toBeNull()
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
    expect(screen.getByTitle('Skills day 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeTruthy()
    expect(screen.getByText(/^Opens /)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /7-Day Onboarding Training/ }))
    expect(screen.getByText('onboarding-panel')).toBeTruthy()
  })

  it('shows the lesson editor to admins', () => {
    mockMe.mockReturnValue({ data: { role: 'admin', training_required: false, training_status: 'not_required' } })
    mockSkills.mockReturnValue(skills({}))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Manage lessons')).toBeTruthy()
    expect(screen.getAllByPlaceholderText('YouTube link')).toHaveLength(7)
  })
})
