import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

const BASE = '/api/v1/system/skills-training'

export type SkillTrainingDay = {
  day_number: number
  title: string
  has_video: boolean
  /** Only returned for admins (content editing). */
  youtube_url: string | null
  unlocked: boolean
  /** ISO date (IST) when a locked day opens, if it is waiting on the calendar. */
  unlocks_on: string | null
  completed: boolean
  completed_at: string | null
}

export type SkillTrainingSurface = {
  available: boolean
  total_days: number
  completed_days: number
  days: SkillTrainingDay[]
}

export type SkillTrainingMember = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  available: boolean
  completed_days: number
  last_completed_at: string | null
}

export type SkillTrainingOverview = {
  total_days: number
  members: SkillTrainingMember[]
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

export function useMarkSkillDayDoneMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dayNumber: number) =>
      request<SkillTrainingSurface>(`${BASE}/days/${dayNumber}/done`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(SURFACE_KEY, data)
      void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY })
    },
  })
}

export function useSaveSkillDayMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dayNumber, title, youtubeUrl }: { dayNumber: number; title: string; youtubeUrl: string }) =>
      request(`${BASE}/admin/day/${dayNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, youtube_url: youtubeUrl }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SURFACE_KEY })
      void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY })
    },
  })
}

export function skillDayEmbedUrl(dayNumber: number): string {
  return `${BASE}/days/${dayNumber}/embed`
}
