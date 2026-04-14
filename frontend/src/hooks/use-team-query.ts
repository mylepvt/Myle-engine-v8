import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamMemberPublic = {
  id: number
  fbo_id: string
  username: string | null
  email: string
  role: string
  created_at: string
}

export type TeamMemberListResponse = {
  items: TeamMemberPublic[]
  total: number
  limit: number
  offset: number
}

export type TeamMyTeamResponse = {
  items: TeamMemberPublic[]
  total: number
}

export type TeamEnrollmentListResponse = {
  items: TeamEnrollmentRequest[]
  total: number
  limit: number
  offset: number
}

export type TeamEnrollmentRequest = {
  lead_id: number
  lead_name: string
  lead_phone: string | null
  payment_amount_cents: number | null
  payment_proof_url: string | null
  payment_proof_uploaded_at: string | null
  uploaded_by_user_id: number | null
  uploaded_by_username: string | null
  status: 'pending' | 'approved' | 'rejected'
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchTeamMembers(): Promise<TeamMemberListResponse> {
  const res = await apiFetch('/api/v1/team/members')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function fetchMyTeam(): Promise<TeamMyTeamResponse> {
  const res = await apiFetch('/api/v1/team/my-team')
  if (!res.ok) await parseError(res)
  return res.json()
}

async function fetchEnrollmentRequests(): Promise<TeamEnrollmentListResponse> {
  const res = await apiFetch('/api/v1/team/enrollment-requests')
  if (!res.ok) await parseError(res)
  return res.json()
}

export async function decideEnrollmentRequest(body: {
  leadId: number
  action: 'approve' | 'reject'
  reason?: string | null
}): Promise<{ ok: boolean; payment_status: string; message: string }> {
  const res = await apiFetch(`/api/v1/team/enrollment-requests/${body.leadId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: body.action,
      reason: body.reason ?? undefined,
    }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export type TeamMemberCreateBody = {
  fbo_id: string
  username?: string | null
  email: string
  password: string
  role: 'admin' | 'leader' | 'team'
}

export async function createTeamMember(body: TeamMemberCreateBody): Promise<TeamMemberPublic> {
  const res = await apiFetch('/api/v1/team/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useTeamMembersQuery(enabled = true) {
  return useQuery({
    queryKey: ['team', 'members'],
    queryFn: fetchTeamMembers,
    enabled,
  })
}

export function useMyTeamQuery(enabled = true) {
  return useQuery({
    queryKey: ['team', 'my-team'],
    queryFn: fetchMyTeam,
    enabled,
  })
}

export function useEnrollmentRequestsQuery(enabled = true) {
  return useQuery({
    queryKey: ['team', 'enrollment-requests'],
    queryFn: fetchEnrollmentRequests,
    enabled,
  })
}

export function useEnrollmentDecisionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: decideEnrollmentRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'enrollment-requests'] })
    },
  })
}
