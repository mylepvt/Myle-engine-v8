import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SkillsTrainingPage } from '@/pages/SkillsTrainingPage'
import type { SkillTrainingSurface } from '@/hooks/use-skills-training-query'

const mockMe = vi.fn()
const mockSurface = vi.fn()

vi.mock('@/hooks/use-auth-me-query', () => ({
  useAuthMeQuery: () => mockMe(),
}))

vi.mock('@/hooks/use-skills-training-query', () => ({
  skillDayEmbedUrl: (n: number) => `/embed/${n}`,
  useSkillsTrainingQuery: () => mockSurface(),
  useSkillsTrainingProgressQuery: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMarkSkillDayDoneMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSkillDayMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function surface(overrides: Partial<SkillTrainingSurface>) {
  return { data: { available: true, total_days: 0, completed_days: 0, days: [], ...overrides }, isPending: false, isError: false, error: null, refetch: vi.fn() }
}

describe('SkillsTrainingPage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    mockMe.mockReturnValue({ data: { role: 'team' } })
  })

  it('tells members still in onboarding that it opens later', () => {
    mockSurface.mockReturnValue(surface({ available: false }))
    render(<SkillsTrainingPage title="Skills Training" />)
    expect(screen.getByText('Opens after onboarding')).toBeTruthy()
  })

  it('opens the next unwatched day and shows when the following one unlocks', () => {
    mockSurface.mockReturnValue(
      surface({
        total_days: 2,
        days: [
          { day_number: 1, title: 'Time management', has_video: true, youtube_url: null, unlocked: true, unlocks_on: null, completed: false, completed_at: null },
          { day_number: 2, title: 'Communication', has_video: true, youtube_url: null, unlocked: false, unlocks_on: '2026-09-30', completed: false, completed_at: null },
        ],
      }),
    )
    render(<SkillsTrainingPage title="Skills Training" />)
    expect(screen.getByTitle('Skills day 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeTruthy()
    expect(screen.getByText(/^Opens /)).toBeTruthy()
    expect(screen.queryByText('Manage lessons')).toBeNull()
  })

  it('shows the lesson editor to admins', () => {
    mockMe.mockReturnValue({ data: { role: 'admin' } })
    mockSurface.mockReturnValue(surface({}))
    render(<SkillsTrainingPage title="Skills Training" />)
    expect(screen.getByText('Manage lessons')).toBeTruthy()
    expect(screen.getAllByPlaceholderText('YouTube link')).toHaveLength(7)
  })
})
