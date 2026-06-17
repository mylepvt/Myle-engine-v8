import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type TrainingTestSummary = {
  score: number
  total: number
  percent: number
  passed: boolean
}

export type TrainingProgressMember = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  joining_date: string | null
  training_required: boolean
  training_status: string
  days_done: number
  total_days: number
  has_certificate: boolean
  test: TrainingTestSummary | null
}

export type TrainingProgressGroup = {
  leader_user_id: number | null
  leader_name: string
  member_count: number
  completed_count: number
  members: TrainingProgressMember[]
}

export type TrainingOverviewResponse = {
  groups: TrainingProgressGroup[]
  total_members: number
  total_days: number
}

async function fetchTrainingOverview(): Promise<TrainingOverviewResponse> {
  const res = await apiFetch('/api/v1/admin/training/progress')
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  return raw as TrainingOverviewResponse
}

export function useTrainingOverviewQuery() {
  return useQuery({
    queryKey: ['admin', 'training', 'progress'],
    queryFn: fetchTrainingOverview,
    staleTime: 30_000,
  })
}

async function postTraining(path: string): Promise<unknown> {
  const res = await apiFetch(path, { method: 'POST' })
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  return raw
}

export function useToggleTrainingRequirementMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => postTraining(`/api/v1/admin/training/${userId}/toggle`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'training', 'progress'] })
    },
  })
}

export function useResetTrainingMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => postTraining(`/api/v1/admin/training/${userId}/reset`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'training', 'progress'] })
    },
  })
}
