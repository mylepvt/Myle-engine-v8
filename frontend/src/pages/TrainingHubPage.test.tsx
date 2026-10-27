import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

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

let nextId = 1

function lesson(number: number, title: string, extra: Partial<SkillLesson> = {}): SkillLesson {
  return {
    id: nextId++,
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

const PD_TITLES = ['THE RESET', 'THE RESET PART 2ND', 'Reaction to Direction', 'Communication and Bonding', 'Invitation Training 1']

const ACADEMY = [
  ['process', 'Process Mastery', 4],
  ['invitation', 'Invitation', 5],
  ['follow_up', 'Follow-up', 5],
  ['bond_creation', 'Bond Creation', 5],
  ['mistakes', "Mistakes — Do's & Don'ts", 5],
  ['closing', 'Closing', 5],
] as const

function category(key: string, title: string, number: number | null, lessons: SkillLesson[]): SkillCategory {
  const done = lessons.filter((l) => l.completed).length
  return {
    key,
    number,
    title,
    purpose: `${title} purpose`,
    total_lessons: lessons.length,
    completed_lessons: done,
    status: done === 0 ? 'not_started' : done >= lessons.length ? 'completed' : 'in_progress',
    lessons,
  }
}

/** The real structure: 5 Personal Development + 29 Skills Academy lessons. */
function surface({
  available = true,
  pdDone = 0,
  onboarding = {},
  overrideLesson,
}: {
  available?: boolean
  pdDone?: number
  onboarding?: Partial<SkillTrainingSurface['onboarding']>
  overrideLesson?: (key: string, l: SkillLesson) => SkillLesson
} = {}) {
  nextId = 1
  const pdLessons = PD_TITLES.map((t, i) => lesson(i + 1, t, { completed: i < pdDone }))
  const pd = category('personal_development', 'Personal Development', null, pdLessons)
  const categories = ACADEMY.map(([key, title, count], i) =>
    category(
      key,
      title,
      i + 1,
      Array.from({ length: count }, (_, j) => {
        const l = lesson(j + 1, `${title} lesson ${j + 1}`)
        return overrideLesson ? overrideLesson(key, l) : l
      }),
    ),
  )
  const strip = (c: SkillCategory) => (available ? c : { ...c, lessons: [] })
  const firstOpen = (cats: SkillCategory[]) => cats.flatMap((c) => c.lessons).find((l) => !l.completed)?.id ?? null
  const pdNext = available ? firstOpen([pd]) : null
  const academyNext = available ? firstOpen(categories) : null
  const data: SkillTrainingSurface = {
    available,
    total_lessons: 34,
    completed_lessons: pdDone,
    next_lesson_id: pdNext ?? academyNext,
    onboarding: {
      status: available ? 'completed' : 'in_progress',
      total_days: 7,
      completed_days: available ? 7 : 2,
      current_day: available ? null : 3,
      awaiting_certification: false,
      teaser: false,
      ...onboarding,
    },
    personal_development: { ...strip(pd), next_lesson_id: pdNext },
    academy: {
      status: 'not_started',
      total_lessons: 29,
      completed_lessons: 0,
      next_lesson_id: academyNext,
      categories: categories.map(strip),
    },
  }
  return { data, isPending: false, isError: false, error: null, refetch: vi.fn() }
}

const sectionButton = (name: RegExp) => screen.getByRole('button', { name })

describe('TrainingHubPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    mockComplete.mockReset()
  })

  beforeEach(() => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: true, training_status: 'pending' } })
  })

  it('during onboarding: three separate sections, Personal Development and the academy locked', () => {
    mockSkills.mockReturnValue(surface({ available: false }))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Your Growth Journey')).toBeTruthy()
    expect(screen.getByText('2 of 7 days completed')).toBeTruthy()
    expect(screen.getByText('Continue onboarding — Day 3 of 7.')).toBeTruthy()
    expect(screen.getByText('onboarding-panel')).toBeTruthy()

    fireEvent.click(sectionButton(/^Personal Development/))
    fireEvent.click(sectionButton(/^Skills Academy/))
    // 1 Personal Development row + 6 academy categories, all locked, no lesson content.
    expect(screen.getAllByLabelText('Locked')).toHaveLength(7)
    expect(screen.queryByText('THE RESET')).toBeNull()
    expect(screen.queryByText('Your next level is near!')).toBeNull()
  })

  it('on Day 7: the teaser shows in the Skills Academy, which stays locked', () => {
    mockSkills.mockReturnValue(surface({ available: false, onboarding: { completed_days: 6, current_day: 7, teaser: true } }))
    render(<TrainingHubPage title="Training" />)
    expect(screen.getByText('Your next level is near!')).toBeTruthy()
    expect(screen.getByText(/Complete your 7 days onboarding training to unlock/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Start:/ })).toBeNull()
  })

  it('after unlock: Personal Development lists its 5 videos, separate from the 29-lesson academy', () => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: false, training_status: 'completed' } })
    mockSkills.mockReturnValue(surface({ pdDone: 2 }))
    render(<TrainingHubPage title="Training" />)

    expect(screen.getAllByText('2 of 5 lessons completed')).toHaveLength(2) // journey + open section
    expect(screen.getByText('0 of 29 lessons completed')).toBeTruthy() // journey (academy collapsed)
    // Onboarding stays available to revise.
    expect(screen.queryByText('onboarding-panel')).toBeNull()
    fireEvent.click(sectionButton(/7-Day Onboarding Training/))
    expect(screen.getByText('onboarding-panel')).toBeTruthy()

    // Personal Development is open (not finished yet) and lists its own videos.
    const pdSection = sectionButton(/^Personal Development/).closest('section') as HTMLElement
    expect(within(pdSection).getAllByText(/^(THE RESET|THE RESET PART 2ND|Reaction to Direction|Communication and Bonding|Invitation Training 1)$/).map((n) => n.textContent)).toEqual(PD_TITLES)
    expect(within(pdSection).getAllByText('2/5 done').length).toBeGreaterThan(0) // mobile + desktop badge
    expect(within(pdSection).queryByText('Process Mastery')).toBeNull()
    fireEvent.click(within(pdSection).getByRole('button', { name: /Continue: Reaction to Direction/ }))
    expect(within(pdSection).getByText('Personal Development · Video 03 of 05')).toBeTruthy()

    // Skills Academy: six dropdowns in order, each with its own progress.
    fireEvent.click(sectionButton(/^Skills Academy/))
    const academySection = sectionButton(/^Skills Academy/).closest('section') as HTMLElement
    const titles = within(academySection).getAllByText(/^(Process Mastery|Invitation|Follow-up|Bond Creation|Mistakes — Do's & Don'ts|Closing)$/)
    expect(titles.map((t) => t.textContent)).toEqual(ACADEMY.map(([, t]) => t))
    expect(within(academySection).getByText('0/4')).toBeTruthy()
    expect(within(academySection).getAllByText('0/5')).toHaveLength(5)
    expect(within(academySection).queryByText('THE RESET')).toBeNull()
  })

  it('once Personal Development is done, the academy opens and a lesson can be completed', () => {
    mockMe.mockReturnValue({ data: { role: 'team', training_required: false, training_status: 'completed' } })
    mockSkills.mockReturnValue(
      surface({
        pdDone: 5,
        overrideLesson: (key, l) =>
          key === 'process' && l.number === 1 ? { ...l, practice_task: 'Map your pipeline', practice_required: true } : l,
      }),
    )
    render(<TrainingHubPage title="Training" />)
    expect(screen.queryByText('THE RESET')).toBeNull() // Personal Development collapsed
    expect(screen.getByText('Build skills. Take action. Improve.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Start: Process Mastery lesson 1/ }))
    expect(screen.getByText('Process Mastery · Video 01 of 04')).toBeTruthy()
    const done = screen.getByRole('button', { name: 'Mark as complete' }) as HTMLButtonElement
    expect(done.disabled).toBe(true) // practice answer required first
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lead → call → meeting → follow-up → close' } })
    fireEvent.click(done)
    expect(mockComplete).toHaveBeenCalledWith({ lessonId: 6, practiceResponse: 'Lead → call → meeting → follow-up → close' })

    fireEvent.click(screen.getByRole('button', { name: /Next lesson/ }))
    expect(screen.getByText('Process Mastery · Video 02 of 04')).toBeTruthy()
  })

  it('shows separate lesson editors to admins', () => {
    mockMe.mockReturnValue({ data: { role: 'admin', training_required: false, training_status: 'not_required' } })
    mockSkills.mockReturnValue(surface({ pdDone: 5 }))
    render(<TrainingHubPage title="Training" />)
    fireEvent.click(sectionButton(/^Personal Development/))
    const pdSection = sectionButton(/^Personal Development/).closest('section') as HTMLElement
    const academySection = sectionButton(/^Skills Academy/).closest('section') as HTMLElement
    expect(within(pdSection).getAllByRole('button', { name: 'Add lesson' })).toHaveLength(1)
    expect(within(academySection).getAllByRole('button', { name: 'Add lesson' })).toHaveLength(6)
  })
})
