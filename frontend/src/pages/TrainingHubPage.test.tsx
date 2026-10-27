import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TrainingHubPage } from '@/pages/TrainingHubPage'
import type { SkillCategory, SkillLesson, SkillTrainingSurface } from '@/hooks/use-skills-training-query'

const mockMe = vi.fn()
const mockSkills = vi.fn()
const mockComplete = vi.fn()

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

vi.mock('@/hooks/use-skills-training-query', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
  return {
    skillLessonEmbedUrl: (id: number) => `/embed/${id}`,
    useSkillsTrainingQuery: () => mockSkills(),
    useSkillsTrainingProgressQuery: () => ({ data: undefined, isPending: false, isError: false, error: null }),
    useCompleteSkillLessonMutation: () => ({ mutateAsync: mockComplete, isPending: false }),
    useCreateSkillLessonMutation: mutation,
    useUpdateSkillLessonMutation: mutation,
    useDeleteSkillLessonMutation: mutation,
  }
})

function lesson(id: number, number: number, title: string, extra: Partial<SkillLesson> = {}): SkillLesson {
  return {
    id,
    number,
    position: number,
    title,
    description: null,
    duration_minutes: null,
    practice_task: null,
    practice_required: false,
    has_video: true,
    youtube_url: null,
    completed: false,
    completed_at: null,
    practice_response: null,
    ...extra,
  }
}

const KEYS = [
  ['process', 'Process Mastery'],
  ['invitation', 'Invitation'],
  ['follow_up', 'Follow-up'],
  ['bond_creation', 'Bond Creation'],
  ['mistakes', "Mistakes — Do's & Don'ts"],
  ['closing', 'Closing'],
] as const

function categories(lessonsByKey: Record<string, SkillLesson[]> = {}, totals: Record<string, number> = {}): SkillCategory[] {
  return KEYS.map(([key, title], i) => {
    const lessons = lessonsByKey[key] ?? []
    const done = lessons.filter((l) => l.completed).length
    return {
      key,
      number: i + 1,
      title,
      purpose: `${title} purpose`,
      total_lessons: totals[key] ?? lessons.length,
      completed_lessons: done,
      status: done === 0 ? 'not_started' : done >= lessons.length ? 'completed' : 'in_progress',
      lessons,
    }
  })
}

function skills(overrides: Partial<SkillTrainingSurface>) {
  const data: SkillTrainingSurface = {
    available: true,
    status: 'not_started',
    total_lessons: 0,
    completed_lessons: 0,
    next_lesson_id: null,
    onboarding: {
      status: 'completed',
      total_days: 7,
      completed_days: 7,
      current_day: null,
      awaiting_certification: false,
      teaser: false,
    },
    categories: categories(),
    ...overrides,
  }
  return { data, isPending: false, isError: false, error: null, refetch: vi.fn() }
}

const locked = (onboarding: Partial<SkillTrainingSurface['onboarding']>) =>
  skills({
    available: false,
    categories: categories({}, { invitation: 5, follow_up: 5 }),
    onboarding: {
      status: 'in_progress',
      total_days: 7,
      completed_days: 2,
      current_day: 3,
      awaiting_certification: false,
      teaser: false,
      ...onboarding,
    },
  })

describe('TrainingHubPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    mockComplete.mockReset()
  })

  beforeEach(() => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: true, training_status: 'pending' } })
  })

  it('during onboarding: journey shows day progress, skills locked with no teaser', () => {
    mockSkills.mockReturnValue(locked({}))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Your Growth Journey')).toBeTruthy()
    expect(screen.getByText('2 of 7 days completed')).toBeTruthy()
    expect(screen.getByText('Continue onboarding — Day 3 of 7.')).toBeTruthy()
    expect(screen.getByText('onboarding-panel')).toBeTruthy()
    expect(screen.getByText('Unlocks after all 7 onboarding days')).toBeTruthy()
    expect(screen.queryByText('Your next level is near!')).toBeNull()
    expect(screen.getAllByText('Complete all 7 onboarding days to unlock.')).toHaveLength(1) // journey card

    fireEvent.click(screen.getByRole('button', { name: /Personal Development & Skills Academy/ }))
    expect(screen.getAllByText('Complete all 7 onboarding days to unlock.')).toHaveLength(2) // + locked preview
    expect(screen.getAllByLabelText('Locked')).toHaveLength(6)
  })

  it('on Day 7: the teaser shows, but the academy stays locked', () => {
    mockSkills.mockReturnValue(locked({ completed_days: 6, current_day: 7, teaser: true }))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Your next level is near!')).toBeTruthy()
    expect(screen.getByText(/Complete your 7 days onboarding training to unlock/)).toBeTruthy()
    expect(screen.queryByText('Skills Academy')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull()
  })

  it('after unlock: categories in order, next lesson opens the lesson detail', () => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: false, training_status: 'completed' } })
    mockSkills.mockReturnValue(
      skills({
        total_lessons: 3,
        next_lesson_id: 11,
        categories: categories({
          invitation: [
            lesson(11, 1, 'Who to invite', { duration_minutes: 6, practice_task: 'List 10 names', practice_required: true }),
            lesson(12, 2, 'Create curiosity'),
          ],
          closing: [lesson(21, 1, 'Recognising readiness')],
        }),
      }),
    )
    render(<TrainingHubPage title="Training" />)
    expect(screen.queryByText('onboarding-panel')).toBeNull()
    expect(screen.getByText('Build skills. Take action. Improve.')).toBeTruthy()
    const titles = screen.getAllByText(/^(Process Mastery|Invitation|Follow-up|Bond Creation|Mistakes — Do's & Don'ts|Closing)$/)
    expect(titles.map((t) => t.textContent)).toEqual(KEYS.map(([, t]) => t))
    // The category holding the next lesson starts expanded.
    expect(screen.getByText('Create curiosity')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Start: Who to invite/ }))
    expect(screen.getByText('Invitation · Video 01 of 02')).toBeTruthy()
    expect(screen.getByTitle('Who to invite')).toBeTruthy()
    expect(screen.getByText('List 10 names')).toBeTruthy()
    const done = screen.getByRole('button', { name: 'Mark as complete' }) as HTMLButtonElement
    expect(done.disabled).toBe(true) // practice answer required first

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Neighbours, college friends, gym group…' } })
    expect(done.disabled).toBe(false)
    fireEvent.click(done)
    expect(mockComplete).toHaveBeenCalledWith({ lessonId: 11, practiceResponse: 'Neighbours, college friends, gym group…' })

    fireEvent.click(screen.getByRole('button', { name: /Next lesson/ }))
    expect(screen.getByText('Invitation · Video 02 of 02')).toBeTruthy()
  })

  it('shows the lesson editor to admins', () => {
    mockMe.mockReturnValue({ data: { role: 'admin', training_required: false, training_status: 'not_required' } })
    mockSkills.mockReturnValue(skills({}))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Manage lessons')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Add lesson' })).toHaveLength(6)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add lesson' })[1])
    expect(screen.getByPlaceholderText('Unlisted YouTube link')).toBeTruthy()
  })
})
