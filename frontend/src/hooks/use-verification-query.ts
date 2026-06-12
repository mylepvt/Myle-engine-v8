import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface VerificationTaskPublic {
  id: number
  title: string
  description: string | null
  task_type: string
  evidence_instructions: string | null
  created_by_user_id: number | null
  is_active: boolean
  created_at: string
}

export interface TaskAssignmentPublic {
  id: number
  verification_task_id: number
  task_title: string | null
  task_type: string | null
  evidence_instructions: string | null
  assigned_to_user_id: number
  assigned_to_name: string | null
  assigned_by_user_id: number | null
  leader_user_id: number | null
  leader_name: string | null
  leader_chain_snapshot: Record<string, unknown> | null
  status: string
  evidence_text: string | null
  evidence_file_url: string | null
  submitted_at: string | null
  verified_by_user_id: number | null
  verified_by_name: string | null
  verified_at: string | null
  rejection_reason: string | null
  blocker_reason: string | null
  blocker_notes: string | null
  result_produced: boolean
  result_notes: string | null
  due_at: string | null
  escalation_level: number
  escalated_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminVerificationSummary {
  total_members: number
  members_active_today: number
  evidence_today: number
  verified_today: number
  pending_verifications: number
  blocked_tasks: number
  ignored_leads: number
  verification_rate_pct: number
  leader_ranking: Array<{
    user_id: number
    name: string
    total_assigned: number
    verified_count: number
    verification_rate_pct: number
  }>
  task_type_breakdown: Array<{
    task_type: string
    count: number
  }>
}

const VERIFICATION_KEYS = {
  all: ['verification'] as const,
  tasks: ['verification', 'tasks'] as const,
  summary: ['verification', 'summary'] as const,
  myTasks: (status?: string) => ['verification', 'my-tasks', status] as const,
  executionScore: ['verification', 'execution-score'] as const,
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

// Member hooks
export function useMyTasks(status?: string) {
  const path = status ? `/verification/tasks/my?status=${status}` : '/verification/tasks/my'
  return useQuery({
    queryKey: VERIFICATION_KEYS.myTasks(status),
    queryFn: () => fetchJson<TaskAssignmentPublic[]>(path),
  })
}

export function useTodayTasks() {
  return useQuery({
    queryKey: [...VERIFICATION_KEYS.myTasks(), 'today'],
    queryFn: () => fetchJson<TaskAssignmentPublic[]>('/verification/tasks/today'),
    refetchInterval: 60_000,
  })
}

export function usePendingVerifications() {
  return useQuery({
    queryKey: [...VERIFICATION_KEYS.myTasks(), 'pending'],
    queryFn: () => fetchJson<TaskAssignmentPublic[]>('/verification/tasks/pending-verification'),
    refetchInterval: 30_000,
  })
}

export function useBlockedTasks() {
  return useQuery({
    queryKey: [...VERIFICATION_KEYS.myTasks(), 'blocked'],
    queryFn: () => fetchJson<TaskAssignmentPublic[]>('/verification/tasks/blocked'),
  })
}

export function useExecutionScore() {
  return useQuery({
    queryKey: VERIFICATION_KEYS.executionScore,
    queryFn: () => fetchJson<{ execution_score: number }>('/verification/tasks/execution-score'),
    refetchInterval: 60_000,
  })
}

// Admin hooks
export function useVerificationSummary(enabled = true) {
  return useQuery({
    queryKey: VERIFICATION_KEYS.summary,
    queryFn: () => fetchJson<AdminVerificationSummary>('/verification/admin/verification-summary'),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useAdminTasks(params?: { status?: string; userId?: number; leaderId?: number }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.userId) qs.set('user_id', String(params.userId))
  if (params?.leaderId) qs.set('leader_id', String(params.leaderId))
  return useQuery({
    queryKey: [...VERIFICATION_KEYS.all, 'admin-tasks', params],
    queryFn: () => fetchJson<TaskAssignmentPublic[]>(`/verification/admin/tasks/all?${qs.toString()}`),
  })
}

export function useAdminTasksList() {
  return useQuery({
    queryKey: [...VERIFICATION_KEYS.all, 'admin-tasks-list'],
    queryFn: () => fetchJson<VerificationTaskPublic[]>('/verification/admin/verification-tasks'),
  })
}

// Mutations
export function useSubmitEvidence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, evidenceText, evidenceFileUrl }: {
      assignmentId: number
      evidenceText?: string
      evidenceFileUrl?: string
    }) =>
      apiFetch(`/verification/tasks/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence_text: evidenceText ?? null, evidence_file_url: evidenceFileUrl ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}

export function useBlockTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, blockerReason, blockerNotes }: {
      assignmentId: number
      blockerReason: string
      blockerNotes?: string
    }) =>
      apiFetch(`/verification/tasks/${assignmentId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocker_reason: blockerReason, blocker_notes: blockerNotes ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}

export function useVerifyTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, action, rejectionReason, resultNotes }: {
      assignmentId: number
      action: 'verify' | 'reject' | 'result_produced'
      rejectionReason?: string
      resultNotes?: string
    }) =>
      apiFetch(`/verification/admin/tasks/${assignmentId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rejection_reason: rejectionReason ?? null,
          result_notes: resultNotes ?? null,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; description?: string; task_type?: string; evidence_instructions?: string }) =>
      apiFetch('/verification/admin/verification-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}

export function useBulkAssignTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { verification_task_id: number; user_ids: number[]; due_at?: string }) =>
      apiFetch('/verification/admin/task-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}

export function useRunEscalation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/verification/admin/tasks/escalate', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VERIFICATION_KEYS.all }),
  })
}
