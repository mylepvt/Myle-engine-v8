import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

const BASE = '/api/v1/system/skills-training'

export type TrainingStatus = 'not_started' | 'in_progress' | 'completed'

export type SkillLesson = {
  id: number
  /** 1-based number within its category ("Video 02 of 05"). */
  number: number
  position: number
  title: string
  description: string | null
  duration_minutes: number | null
  practice_task: string | null
  practice_required: boolean
  has_video: boolean
  /** Only returned for admins (content editing). */
  youtube_url: string | null
  completed: boolean
  completed_at: string | null
  practice_response: string | null
}

export type SkillCategory = {
  key: string
  /**
   * Fixed order 1–6: Process, Invitation, Follow-up, Bond Creation, Mistakes, Closing.
   * `null` for Personal Development, which is a separate, unnumbered track.
   */
  number: number | null
  title: string
  purpose: string
  total_lessons: number
  completed_lessons: number
  status: TrainingStatus
  /** Empty while the academy is locked — only the outline is shown. */
  lessons: SkillLesson[]
}

export type OnboardingSummary = {
  status: TrainingStatus
  total_days: number
  completed_days: number
  current_day: number | null
  /** All days ticked; the test / certificate is still pending. */
  awaiting_certification: boolean
  /** Final onboarding day is open — show the next-level preview. Never an unlock. */
  teaser: boolean
}

export type PersonalDevelopmentTrack = SkillCategory & {
  next_lesson_id: number | null
}

export type SkillsAcademyTrack = {
  status: TrainingStatus
  total_lessons: number
  completed_lessons: number
  next_lesson_id: number | null
  /** The six numbered categories, always in order. */
  categories: SkillCategory[]
}

export type SkillTrainingSurface = {
  available: boolean
  /** Personal Development + Skills Academy together. */
  total_lessons: number
  completed_lessons: number
  /** Overall next step: Personal Development first, then the academy. */
  next_lesson_id: number | null
  onboarding: OnboardingSummary
  /** Separate track, listed on its own — not part of the academy. */
  personal_development: PersonalDevelopmentTrack
  academy: SkillsAcademyTrack
}

export type SkillTrainingMember = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  available: boolean
  completed_lessons: number
  personal_development_completed: number
  academy_completed: number
  practice_submitted: number
  by_category: Record<string, number>
  last_completed_at: string | null
}

export type SkillTrainingOverview = {
  total_lessons: number
  personal_development_total: number
  academy_total: number
  categories: { key: string; number: number | null; title: string; total_lessons: number }[]
  members: SkillTrainingMember[]
}

export type SkillLessonInput = {
  category?: string
  position?: number
  title?: string
  description?: string
  youtube_url?: string
  duration_minutes?: number | null
  practice_task?: string
  practice_required?: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (res.status === 204) return undefined as T
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  return raw as T
}

const SURFACE_KEY = ['system', 'skills-training'] as const
const PROGRESS_KEY = ['system', 'skills-training', 'progress'] as const

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function useSkillsTrainingQuery() {
  return useQuery({
    queryKey: SURFACE_KEY,
    queryFn: () => request<SkillTrainingSurface>(BASE),
    staleTime: 30_000,
  })
}

export function useSkillsTrainingProgressQuery(enabled: boolean) {
  return useQuery({
    queryKey: PROGRESS_KEY,
    queryFn: () => request<SkillTrainingOverview>(`${BASE}/progress`),
    enabled,
    staleTime: 30_000,
  })
}

export function useCompleteSkillLessonMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lessonId, practiceResponse }: { lessonId: number; practiceResponse?: string }) =>
      request<SkillTrainingSurface>(
        `${BASE}/lessons/${lessonId}/complete`,
        json('POST', { practice_response: practiceResponse?.trim() || null }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(SURFACE_KEY, data)
      void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY })
    },
  })
}

function useLessonAdminMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SURFACE_KEY })
      void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY })
    },
  })
}

export function useCreateSkillLessonMutation() {
  return useLessonAdminMutation((input: SkillLessonInput) => request(`${BASE}/admin/lessons`, json('POST', input)))
}

export function useUpdateSkillLessonMutation() {
  return useLessonAdminMutation(({ id, ...input }: SkillLessonInput & { id: number }) =>
    request(`${BASE}/admin/lessons/${id}`, json('PUT', input)),
  )
}

export function useDeleteSkillLessonMutation() {
  return useLessonAdminMutation((id: number) => request(`${BASE}/admin/lessons/${id}`, { method: 'DELETE' }))
}

export function skillLessonEmbedUrl(lessonId: number): string {
  return `${BASE}/lessons/${lessonId}/embed`
}
