import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'

export type TeamMemberPublic = {
  id: number
  fbo_id: string
  name?: string | null
  username: string | null
  email: string
  role: string
  created_at: string
  upline_fbo_id?: string | null
  upline_name?: string | null
  training_required?: boolean | null
  training_status?: string | null
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
  direct_members?: number
  total_downline?: number
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
  status: 'pending' | 'proof_uploaded' | 'approved' | 'rejected'
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
  const body = (await res.json()) as TeamEnrollmentListResponse
  return {
    ...body,
    items: body.items.map((item) => ({
      ...item,
      // Backend still stores actionable queue rows as payment_status=proof_uploaded.
      // Normalize that to "pending" so the approvals UI behaves consistently.
      status: (item.status === 'proof_uploaded' ? 'pending' : item.status) as TeamEnrollmentRequest['status'],
    })),
  }
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

/** Admin / leader: shared cache with `useEnrollmentRequestsQuery` — for sidebar + header badges. */
export function useEnrollmentApprovalsPendingQuery() {
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const isApprover =
    Boolean(me?.authenticated) && (me?.role === 'admin' || me?.role === 'leader')

  return useQuery({
    queryKey: ['team', 'enrollment-requests'],
    queryFn: fetchEnrollmentRequests,
    enabled: isApprover && !mePending,
    staleTime: 15_000,
    refetchInterval: isApprover ? 90_000 : false,
  })
}

export async function resetMemberPassword(body: {
  userId: number
  newPassword: string
}): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/api/v1/team/members/${body.userId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: body.newPassword }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export async function resetAllMembersPassword(body: {
  newPassword: string
}): Promise<{ ok: boolean; updated: number }> {
  const res = await apiFetch('/api/v1/team/members/reset-password-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: body.newPassword }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useResetMemberPasswordMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetMemberPassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })
}

export function useResetAllMembersPasswordMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetAllMembersPassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })
}

export type MemberLeadSummary = {
  id: number
  name: string
  status: string
  phone: string | null
  created_at: string
}

export type MemberLeadsResponse = {
  items: MemberLeadSummary[]
  total: number
}

export async function fetchMemberLeads(userId: number): Promise<MemberLeadsResponse> {
  const res = await apiFetch(`/api/v1/team/members/${userId}/leads`)
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useMemberLeadsQuery(userId: number | null) {
  return useQuery({
    queryKey: ['team', 'member-leads', userId],
    queryFn: () => fetchMemberLeads(userId!),
    enabled: userId !== null,
  })
}

export async function updateMemberRole(body: {
  userId: number
  role: string
}): Promise<TeamMemberPublic> {
  const res = await apiFetch(`/api/v1/team/members/${body.userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: body.role }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMemberRole,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })
}

export async function deleteMember(userId: number): Promise<void> {
  const res = await apiFetch(`/api/v1/team/members/${userId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) await parseError(res)
}

export function useDeleteMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
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

async function toggleTrainingLock(body: { userId: number; locked: boolean }): Promise<{ training_required: boolean; training_status: string }> {
  const res = await apiFetch(`/api/v1/team/members/${body.userId}/training-lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked: body.locked }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? res.statusText)
  }
  return res.json()
}

export function useToggleTrainingLockMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: toggleTrainingLock,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })
}
