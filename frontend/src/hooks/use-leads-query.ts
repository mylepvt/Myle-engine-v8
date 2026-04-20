import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { applyCtcsOptimisticToLead } from '@/lib/ctcs-optimistic'

export type LeadStatus =
  | 'new_lead'
  | 'contacted'
  | 'invited'
  | 'whatsapp_sent'
  | 'video_sent'
  | 'video_watched'
  | 'paid'
  | 'mindset_lock'
  | 'day1'
  | 'day2'
  | 'day3'
  | 'interview'
  | 'track_selected'
  | 'seat_hold'
  | 'converted'
  | 'lost'
  | 'retarget'
  | 'inactive'
  | 'training'
  | 'plan_2cc'
  | 'level_up'
  | 'pending'
  | 'new'

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new_lead',       label: 'New Lead' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'invited',        label: 'Invited' },
  { value: 'whatsapp_sent',  label: 'WhatsApp Sent' },
  { value: 'video_sent',     label: 'Video Sent' },
  { value: 'video_watched',  label: 'Video Watched' },
  { value: 'paid',           label: 'Paid ₹196' },
  { value: 'mindset_lock',   label: 'Mindset Lock' },
  { value: 'day1',           label: 'Day 1' },
  { value: 'day2',           label: 'Day 2' },
  { value: 'day3',           label: 'Day 3' },
  { value: 'interview',      label: 'Interview' },
  { value: 'track_selected', label: 'Track Selected' },
  { value: 'seat_hold',      label: 'Seat Hold' },
  { value: 'converted',      label: 'Converted' },
  { value: 'lost',           label: 'Lost' },
  { value: 'retarget',       label: 'Retarget' },
  { value: 'inactive',       label: 'Inactive' },
  { value: 'training',       label: 'Training' },
  { value: 'plan_2cc',       label: '2CC Plan' },
  { value: 'level_up',       label: 'Level Up' },
  { value: 'pending',        label: 'Pending' },
  { value: 'new',            label: 'New (Legacy)' },
]

/** Won/closed statuses for metrics */
export const CLOSED_WON_STATUSES: LeadStatus[] = ['converted']
export const CLOSED_LOST_STATUSES: LeadStatus[] = ['lost', 'inactive']

export type LeadPublic = {
  id: number
  name: string
  status: string
  created_by_user_id: number
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  in_pool: boolean
  pool_price_cents: number | null
  // Contact
  phone: string | null
  email: string | null
  city: string | null
  age: number | null
  gender: string | null
  ad_name: string | null
  source: string | null
  notes: string | null
  // Assignment
  assigned_to_user_id: number | null
  assigned_to_name?: string | null
  // Call tracking
  call_status: string | null
  call_count: number
  last_called_at: string | null
  whatsapp_sent_at: string | null
  // Payment
  payment_status: string | null
  payment_amount_cents: number | null
  payment_proof_url: string | null
  payment_proof_uploaded_at: string | null
  mindset_started_at?: string | null
  mindset_completed_at?: string | null
  mindset_lock_state?: 'mindset_lock' | 'leader_assigned' | null
  // Day completion
  day1_completed_at: string | null
  day2_completed_at: string | null
  day3_completed_at: string | null
  d1_morning: boolean
  d1_afternoon: boolean
  d1_evening: boolean
  d2_morning: boolean
  d2_afternoon: boolean
  d2_evening: boolean
  no_response_attempt_count: number
  /** Call-to-close (optional until backend touched / migration). */
  last_action_at?: string | null
  next_followup_at?: string | null
  heat_score?: number
  is_archived?: boolean
  stage_day?: string
}

export type LeadListResponse = {
  items: LeadPublic[]
  total: number
  limit: number
  offset: number
}

export type LeadListFilters = {
  q: string
  status: '' | LeadStatus
}

/** Optional paging — used by infinite list; plain list omits these (server defaults). */
export type LeadListFetchParams = LeadListFilters & {
  limit?: number
  offset?: number
}

/** Group statuses by phase for filter dropdowns */
export const LEAD_STATUS_GROUPS: { label: string; statuses: LeadStatus[] }[] = [
  { label: 'Pre-Enrollment', statuses: ['new_lead', 'contacted', 'invited', 'whatsapp_sent', 'video_sent', 'video_watched'] },
  { label: 'Enrolled', statuses: ['paid', 'mindset_lock', 'day1', 'day2', 'day3'] },
  { label: 'Closing', statuses: ['interview', 'track_selected', 'seat_hold', 'converted'] },
  { label: 'Re-engage', statuses: ['lost', 'retarget', 'inactive'] },
  { label: 'Other', statuses: ['training', 'plan_2cc', 'level_up', 'pending', 'new'] },
]

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'error' in err
      ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

export type LeadsListMode = 'active' | 'archived' | 'recycle'

export type CtcsTab = 'all' | 'today' | 'followups' | 'hot' | 'converted'

export type CtcsAction = 'not_picked' | 'interested' | 'call_later' | 'not_interested' | 'paid'

export type CtcsListOptions = {
  ctcsFilter?: CtcsTab | null
  ctcsPrioritySort?: boolean
  preEnrollmentOnly?: boolean
}

const DEFAULT_PAGE_SIZE = 50

function buildLeadsQueryString(
  filters: LeadListFetchParams,
  listMode: LeadsListMode,
  ctcs?: CtcsListOptions,
): string {
  const p = new URLSearchParams()
  const t = filters.q.trim()
  if (t) p.set('q', t)
  if (filters.status) p.set('status', filters.status)
  if (listMode === 'archived') p.set('archived_only', 'true')
  if (listMode === 'recycle') p.set('deleted_only', 'true')
  if (filters.limit != null) p.set('limit', String(filters.limit))
  if (filters.offset != null && filters.offset > 0) {
    p.set('offset', String(filters.offset))
  }
  if (ctcs?.ctcsFilter && ctcs.ctcsFilter !== 'all') {
    p.set('ctcs_filter', ctcs.ctcsFilter)
  }
  if (ctcs?.ctcsPrioritySort) {
    p.set('ctcs_priority_sort', 'true')
  }
  if (ctcs?.preEnrollmentOnly) {
    p.set('pre_enrollment_only', 'true')
  }
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

async function fetchLeads(
  filters: LeadListFetchParams,
  listMode: LeadsListMode,
  ctcs?: CtcsListOptions,
): Promise<LeadListResponse> {
  const res = await apiFetch(`/api/v1/leads${buildLeadsQueryString(filters, listMode, ctcs)}`)
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export type CreateLeadBody = {
  name: string
  status?: LeadStatus
  phone?: string | null
  email?: string | null
  city?: string | null
  source?: string | null
  notes?: string | null
}

export async function createLead(body: CreateLeadBody): Promise<LeadPublic> {
  const { name, status = 'new_lead', phone, email, city, source, notes } = body
  const payload: Record<string, unknown> = { name, status }
  if (phone != null && String(phone).trim() !== '') payload.phone = String(phone).trim()
  if (email != null && String(email).trim() !== '') payload.email = String(email).trim()
  if (city != null && String(city).trim() !== '') payload.city = String(city).trim()
  if (source != null && String(source).trim() !== '') payload.source = String(source).trim()
  if (notes != null && String(notes).trim() !== '') payload.notes = String(notes).trim()
  const res = await apiFetch('/api/v1/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export type PatchLeadBody = {
  name?: string
  status?: LeadStatus
  archived?: boolean
  in_pool?: boolean
  restored?: boolean
  pool_price_cents?: number
  phone?: string
  email?: string
  city?: string
  source?: string
  notes?: string
  call_status?: string
  payment_status?: string
  whatsapp_sent?: boolean
  day1_completed?: boolean
  day2_completed?: boolean
  day3_completed?: boolean
  d1_morning?: boolean
  d1_afternoon?: boolean
  d1_evening?: boolean
  d2_morning?: boolean
  d2_afternoon?: boolean
  d2_evening?: boolean
  no_response_attempt_count?: number
  next_followup_at?: string | null
}

export async function patchLead(
  id: number,
  body: PatchLeadBody,
): Promise<LeadPublic> {
  const res = await apiFetch(`/api/v1/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export type PostLeadCtcsActionOpts = {
  followupAt?: string | null
}

export async function postLeadCtcsAction(
  id: number,
  action: CtcsAction,
  opts?: PostLeadCtcsActionOpts,
): Promise<LeadPublic> {
  const body: Record<string, unknown> = { action }
  if (opts?.followupAt != null && opts.followupAt.trim() !== '') {
    body.followup_at = opts.followupAt
  }
  const res = await apiFetch(`/api/v1/leads/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function postLeadCallLog(id: number): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/v1/leads/${id}/call-log`, { method: 'POST' })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function deleteLead(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/leads/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    await parseError(res)
  }
}

export async function permanentDeleteLead(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/leads/${id}/permanent-delete`, { method: 'DELETE' })
  if (!res.ok) {
    await parseError(res)
  }
}

export async function claimLead(id: number): Promise<LeadPublic> {
  const res = await apiFetch(`/api/v1/leads/${id}/claim`, { method: 'POST' })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export type MindsetLockPreviewResponse = {
  eligible: boolean
  minimum_seconds: number
  elapsed_seconds: number
  remaining_seconds: number
  mindset_started_at: string | null
  leader_user_id: number | null
  leader_name: string | null
}

export type MindsetLockCompleteResponse = {
  status: 'assigned'
  leader_name: string
  leader_user_id: number
  duration_seconds: number
  mindset_started_at: string
  mindset_completed_at: string
}

export async function fetchMindsetLockPreview(id: number): Promise<MindsetLockPreviewResponse> {
  const res = await apiFetch(`/api/v1/leads/${id}/mindset-lock-preview`)
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function postMindsetLockComplete(id: number): Promise<MindsetLockCompleteResponse> {
  const res = await apiFetch(`/api/v1/leads/${id}/mindset-lock-complete`, { method: 'POST' })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function fetchAvailableTransitions(leadId: number): Promise<string[]> {
  const res = await apiFetch(`/api/v1/leads/${leadId}/transitions`)
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function transitionLeadStatus(
  leadId: number,
  targetStatus: string,
  notes?: string,
): Promise<{ success: boolean; message: string; new_status: string }> {
  const res = await apiFetch(`/api/v1/leads/${leadId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_status: targetStatus,
      notes,
    }),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export function useLeadsQuery(
  enabled: boolean,
  filters: LeadListFilters,
  listMode: LeadsListMode = 'active',
  ctcs?: CtcsListOptions,
) {
  return useQuery({
    queryKey: ['leads', 'list', listMode, filters.q.trim(), filters.status, ctcs],
    queryFn: () => fetchLeads(filters, listMode, ctcs),
    enabled,
  })
}

/** Paged list for Work → Leads (load more). */
export function useLeadsInfiniteQuery(
  enabled: boolean,
  filters: LeadListFilters,
  listMode: LeadsListMode = 'active',
  pageSize: number = DEFAULT_PAGE_SIZE,
  ctcs?: CtcsListOptions,
) {
  return useInfiniteQuery({
    queryKey: [
      'leads',
      'list',
      'paged',
      listMode,
      filters.q.trim(),
      filters.status,
      pageSize,
      ctcs?.ctcsFilter,
      ctcs?.ctcsPrioritySort,
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLeads(
        { ...filters, limit: pageSize, offset: pageParam as number },
        listMode,
        ctcs,
      ),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled,
  })
}

function invalidateLeadRelated(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['leads', 'list'] })
  void qc.invalidateQueries({ queryKey: ['lead-pool'] })
  void qc.invalidateQueries({ queryKey: ['workboard'] })
  void qc.invalidateQueries({ queryKey: ['retarget'] })
  void qc.invalidateQueries({ queryKey: ['follow-ups'] })
}

function isLeadsInfiniteData(data: unknown): data is InfiniteData<LeadListResponse> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'pages' in data &&
    Array.isArray((data as InfiniteData<LeadListResponse>).pages)
  )
}

export type LeadFileImportResult = {
  imported: number
  skipped: number
  warnings: string[]
}

export async function importLeadsFile(file: File, sourceTag?: string): Promise<LeadFileImportResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('source_tag', (sourceTag ?? 'Import').trim() || 'Import')
  const res = await apiFetch('/api/v1/leads/import-file', { method: 'POST', body: fd })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json() as Promise<LeadFileImportResult>
}

export function useCreateLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLeadBody) => createLead(body),
    onSuccess: () => {
      invalidateLeadRelated(qc)
    },
  })
}

export function useImportLeadsFileMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, sourceTag }: { file: File; sourceTag?: string }) =>
      importLeadsFile(file, sourceTag),
    onSuccess: () => {
      invalidateLeadRelated(qc)
    },
  })
}

export function usePatchLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number
      body: Parameters<typeof patchLead>[1]
    }) => patchLead(id, body),
    onSuccess: () => {
      invalidateLeadRelated(qc)
    },
  })
}

export function useDeleteLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteLead,
    onSuccess: () => invalidateLeadRelated(qc),
  })
}

export function usePermanentDeleteLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: permanentDeleteLead,
    onSuccess: () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['leads'] }),
        qc.invalidateQueries({ queryKey: ['workboard'] }),
      ])
    },
  })
}

export function useClaimLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimLead,
    onSuccess: () => invalidateLeadRelated(qc),
  })
}

export function useAvailableTransitionsQuery(leadId: number) {
  return useQuery({
    queryKey: ['leads', 'transitions', leadId],
    queryFn: () => fetchAvailableTransitions(leadId),
    staleTime: 30_000,
    enabled: leadId > 0,
  })
}

export function useTransitionLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      leadId,
      targetStatus,
      notes,
    }: {
      leadId: number
      targetStatus: string
      notes?: string
    }) => transitionLeadStatus(leadId, targetStatus, notes),
    onSuccess: () => invalidateLeadRelated(qc),
  })
}

export type LeadCtcsActionMutationVars = {
  id: number
  action: CtcsAction
  followupAt?: string | null
  paidStatus?: 'paid' | 'day1'
}

export function useLeadCtcsActionMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, followupAt }: LeadCtcsActionMutationVars) =>
      postLeadCtcsAction(id, action, { followupAt }),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['leads', 'list', 'paged'], exact: false })
      const previous = qc.getQueriesData({ queryKey: ['leads', 'list', 'paged'], exact: false })
      const optimisticOpts = {
        followupAt: variables.followupAt,
        paidStatus: variables.paidStatus,
      }
      previous.forEach(([queryKey, data]) => {
        if (!isLeadsInfiniteData(data)) return
        qc.setQueryData(queryKey, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === variables.id
                ? applyCtcsOptimisticToLead(item, variables.action, optimisticOpts)
                : item,
            ),
          })),
        })
      })
      return { previous }
    },
    onError: (_err, _variables, context) => {
      context?.previous?.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
    },
    onSettled: () => {
      invalidateLeadRelated(qc)
    },
  })
}

export function useLeadCallLogMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => postLeadCallLog(id),
    onSuccess: () => invalidateLeadRelated(qc),
  })
}
