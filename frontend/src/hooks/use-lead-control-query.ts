import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type LeadControlAssignableUser = {
  user_id: number
  display_name: string
  role: string
  fbo_id: string
  username: string | null
  active_leads_count: number
  xp_total: number
}

export type LeadControlQueueLead = {
  lead_id: number
  lead_name: string
  phone: string | null
  status: string
  owner_user_id: number | null
  owner_name: string
  assigned_to_user_id: number | null
  assigned_to_name: string
  archived_at: string
  watch_completed_at: string | null
  last_action_at: string | null
}

export type LeadControlHistorySummaryRow = {
  user_id: number
  display_name: string
  role: string
  total_received: number
  manual_received: number
  auto_received: number
  last_received_at: string | null
}

export type LeadControlHistoryRow = {
  activity_id: number
  occurred_at: string
  mode: 'manual' | 'auto'
  lead_id: number
  lead_name: string
  previous_assignee_user_id: number | null
  previous_assignee_name: string | null
  assigned_to_user_id: number | null
  assigned_to_name: string | null
  owner_user_id: number | null
  owner_name: string | null
  actor_name: string
  reason: string | null
}

export type LeadControlResponse = {
  note: string | null
  queue: LeadControlQueueLead[]
  queue_total: number
  assignable_users: LeadControlAssignableUser[]
  history_summary: LeadControlHistorySummaryRow[]
  history: LeadControlHistoryRow[]
  history_total: number
}

export type LeadControlManualReassignBody = {
  leadId: number
  toUserId: number
  reason?: string | null
}

export type LeadControlManualReassignResponse = {
  success: boolean
  message: string
  lead_id: number
  previous_assignee_user_id: number | null
  previous_assignee_name: string | null
  assigned_to_user_id: number
  assigned_to_name: string
  owner_user_id: number | null
  owner_name: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(messageFromApiErrorPayload(body, `HTTP ${response.status}`))
  }
  return body as T
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(messageFromApiErrorPayload(payload, `HTTP ${response.status}`))
  }
  return payload as T
}

export function useLeadControlQuery() {
  return useQuery({
    queryKey: ['execution', 'lead-control'],
    queryFn: () => fetchJson<LeadControlResponse>('/api/v1/execution/lead-control'),
    staleTime: 30_000,
  })
}

export function useLeadControlManualReassignMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: LeadControlManualReassignBody) =>
      postJson<LeadControlManualReassignResponse>('/api/v1/execution/lead-control/reassign', {
        lead_id: body.leadId,
        to_user_id: body.toUserId,
        reason: body.reason ?? undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['execution', 'lead-control'] }),
        queryClient.invalidateQueries({ queryKey: ['execution', 'day2-review'] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['workboard'] }),
      ])
    },
  })
}
