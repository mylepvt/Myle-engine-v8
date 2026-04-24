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
  access_blocked?: boolean | null
  discipline_status?: string | null
  grace_end_date?: string | null
  grace_reason?: string | null
  discipline_reset_on?: string | null
  removed_at?: string | null
  removed_by_user_id?: number | null
  removal_reason?: string | null
  calls_short_streak?: number | null
  missing_report_streak?: number | null
  compliance_level?:
    | 'clear'
    | 'warning'
    | 'strong_warning'
    | 'final_warning'
    | 'grace'
    | 'grace_ending'
    | 'removed'
    | 'not_applicable'
    | null
  compliance_title?: string | null
  compliance_summary?: string | null
  grace_active?: boolean | null
  grace_ending_tomorrow?: boolean | null
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

export type TeamEnrollmentHistoryItem = TeamEnrollmentRequest & {
  reviewed_at: string
  reviewed_by_user_id: number | null
  reviewed_by_username: string | null
  review_action: 'approved' | 'rejected'
  review_note: string | null
}

export type TeamEnrollmentHistoryResponse = {
  items: TeamEnrollmentHistoryItem[]
  total: number
  date: string
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

const TEAM_MEMBERS_PAGE_SIZE = 100

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

export async function fetchTeamMembers(): Promise<TeamMemberListResponse> {
  const items: TeamMemberPublic[] = []
  let total = 0
  let offset = 0

  while (true) {
    const res = await apiFetch(`/api/v1/team/members?limit=${TEAM_MEMBERS_PAGE_SIZE}&offset=${offset}`)
    if (!res.ok) await parseError(res)

    const page = (await res.json()) as TeamMemberListResponse
    total = page.total
    items.push(...page.items)

    if (page.items.length === 0 || items.length >= total) {
      break
    }

    offset += page.items.length
  }

  return {
    items,
    total: Math.max(total, items.length),
    limit: items.length,
    offset: 0,
  }
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

async function fetchEnrollmentHistory(date: string): Promise<TeamEnrollmentHistoryResponse> {
  const params = new URLSearchParams()
  if (date.trim()) params.set('date', date.trim())
  const qs = params.toString()
  const res = await apiFetch(`/api/v1/team/enrollment-requests/history${qs ? `?${qs}` : ''}`)
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

export function useEnrollmentHistoryQuery(date: string, enabled = true) {
  return useQuery({
    queryKey: ['team', 'enrollment-history', date],
    queryFn: () => fetchEnrollmentHistory(date),
    enabled: enabled && date.trim().length > 0,
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

export async function updateMemberCompliance(body: {
  userId: number
  action: 'grant_grace' | 'clear_grace' | 'restore_access' | 'remove_now'
  graceEndDate?: string | null
  reason?: string | null
}): Promise<TeamMemberPublic> {
  const res = await apiFetch(`/api/v1/team/members/${body.userId}/compliance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: body.action,
      grace_end_date: body.graceEndDate ?? undefined,
      reason: body.reason ?? undefined,
    }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useUpdateMemberComplianceMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMemberCompliance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
      void queryClient.invalidateQueries({ queryKey: ['gate-assistant'] })
      void queryClient.invalidateQueries({ queryKey: ['team', 'tracking'] })
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
      void queryClient.invalidateQueries({ queryKey: ['team', 'enrollment-history'] })
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
