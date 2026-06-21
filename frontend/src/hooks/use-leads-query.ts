import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { applyCtcsOptimisticToLead } from '@/lib/ctcs-optimistic'
import type { WorkboardResponse } from '@/hooks/use-workboard-query'

export type LeadStatus =
  | 'new_lead'
  | 'contacted'
  | 'invited'
  | 'video_sent'
  | 'video_watched'
  | 'day1'
  | 'day2'
  | 'day3'
  | 'converted'
  | 'lost'
  | 'retarget'
  | 'inactive'
  | 'training'
  | 'new'

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new_lead',       label: 'New Lead' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'invited',        label: 'Invited' },
  { value: 'video_sent',     label: 'Enrollment Live' },
  { value: 'video_watched',  label: 'Video Watched' },
  { value: 'day1',           label: 'Day 1' },
  { value: 'day2',           label: 'Day 2' },
  { value: 'day3',           label: 'Day 3' },
  { value: 'converted',      label: 'Converted' },
  { value: 'lost',           label: 'Lost' },
  { value: 'retarget',       label: 'Retarget' },
  { value: 'inactive',       label: 'Inactive' },
  { value: 'training',       label: 'Training' },
  { value: 'new',            label: 'New (Legacy)' },
]

export const PRIMARY_USER_FLOW_STATUSES: LeadStatus[] = [
  'new_lead',
  'invited',
  'video_sent',
  'video_watched',
  'day1',
  'day2',
  'day3',
  'converted',
]

export const USER_OUTCOME_STATUSES: LeadStatus[] = ['lost', 'retarget', 'inactive']

export const INTERNAL_OPS_STATUSES: LeadStatus[] = ['contacted']

export const LEGACY_COMPAT_STATUSES: LeadStatus[] = [
  'training',
  'new',
]

/** Won/closed statuses for metrics */
export const CLOSED_WON_STATUSES: LeadStatus[] = ['converted']
export const CLOSED_LOST_STATUSES: LeadStatus[] = ['lost', 'inactive']

export type LeadPublic = {
  id: number
  name: string
  status: string
  created_by_user_id: number
  owner_user_id?: number | null
  owner_name?: string | null
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
  assigned_to_role?: string | null
  leader_user_id?: number | null
  leader_name?: string | null
  is_reassigned?: boolean | null
  // Post-close onboarding (register link → 7-day training)
  register_token?: string | null
  register_link_sent_at?: string | null
  registered_user_id?: number | null
  registered_at?: string | null
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
  day4_completed_at: string | null
  day5_completed_at: string | null
  // Day 2 cheat-proof business test
  day2_test_status?: 'pending' | 'in_progress' | 'passed' | 'failed'
  day2_test_score?: number | null
  day2_test_attempts?: number
  day2_test_completed_at?: string | null
  // Day 3 closing — Stage selection + seat-hold
  stage_selected?: 'stage1' | 'stage2' | 'stage3' | null
  stage_price_cents?: number | null
  seat_hold_amount_cents?: number | null
  seat_hold_expiry?: string | null
  d1_morning: boolean
  d1_afternoon: boolean
  d1_evening: boolean
  d2_morning: boolean
  d2_afternoon: boolean
  d2_evening: boolean
  d3_morning: boolean
  d3_afternoon: boolean
  d3_evening: boolean
  d4_morning: boolean
  d4_afternoon: boolean
  d4_evening: boolean
  d5_morning: boolean
  d5_afternoon: boolean
  d5_evening: boolean
  d6_6pm: boolean
  d6_8pm: boolean
  process_tracking?: Record<string, Record<string, boolean>> | null
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
  { label: 'Main Journey', statuses: PRIMARY_USER_FLOW_STATUSES },
  { label: 'Outcomes', statuses: USER_OUTCOME_STATUSES },
  { label: 'Internal Ops', statuses: INTERNAL_OPS_STATUSES },
  { label: 'Legacy / Compat', statuses: LEGACY_COMPAT_STATUSES },
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

export type CtcsTab = 'all' | 'today' | 'followups' | 'hot' | 'converted' | 'reassigned' | 'pending'

export type CtcsAction = 'not_picked' | 'interested' | 'call_later' | 'not_interested' | 'paid'

export type CtcsListOptions = {
  ctcsFilter?: CtcsTab | null
  ctcsPrioritySort?: boolean
  preEnrollmentOnly?: boolean
  searchAllSections?: boolean
  leaderAllScope?: boolean
  /** Only leads captured via member capture links — the "Generated" pill. */
  generatedOnly?: boolean
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
    p.set('pre_flp_min_billing_only', 'true')
  }
  if (ctcs?.searchAllSections) {
    p.set('search_all_sections', 'true')
  }
  if (ctcs?.leaderAllScope) {
    p.set('leader_all_scope', 'true')
  }
  if (ctcs?.generatedOnly) {
    p.set('generated_only', 'true')
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
  assigned_to_user_id?: number
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
  d3_morning?: boolean
  d3_afternoon?: boolean
  d3_evening?: boolean
  d4_morning?: boolean
  d4_afternoon?: boolean
  d4_evening?: boolean
  d5_morning?: boolean
  d5_afternoon?: boolean
  d5_evening?: boolean
  d6_6pm?: boolean
  d6_8pm?: boolean
  process_stage?: string
  process_task?: string
  process_task_done?: boolean
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

export type RegisterLinkResult = {
  register_url: string
  manual_share_url: string | null
  auto_sent: boolean
  already_registered: boolean
}

/** Get (or re-send) a converted lead's register link. */
export async function postLeadRegisterLink(
  id: number,
  resend = false,
): Promise<RegisterLinkResult> {
  const res = await apiFetch(`/api/v1/leads/${id}/register-link?resend=${resend ? 'true' : 'false'}`, {
    method: 'POST',
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
      ctcs?.preEnrollmentOnly,
      ctcs?.searchAllSections,
      ctcs?.leaderAllScope,
      ctcs?.generatedOnly,
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
  void qc.invalidateQueries({ queryKey: ['execution'] })
}

function isLeadsInfiniteData(data: unknown): data is InfiniteData<LeadListResponse> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'pages' in data &&
    Array.isArray((data as InfiniteData<LeadListResponse>).pages)
  )
}

function isLeadListResponse(data: unknown): data is LeadListResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as LeadListResponse).items)
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

// Fields whose value can be copied straight onto a cached lead card for an
// instant optimistic update (no derived/server-computed values here).
const OPTIMISTIC_PATCH_FIELDS = [
  'status',
  'call_status',
  'name',
  'd1_morning',
  'd1_afternoon',
  'd1_evening',
  'd2_morning',
  'd2_afternoon',
  'd2_evening',
  'd6_6pm',
  'd6_8pm',
] as const

function isWorkboardData(data: unknown): data is WorkboardResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as WorkboardResponse).columns)
  )
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
    onMutate: async ({ id, body }) => {
      // Optimistically reflect every field that maps 1:1 onto a card so clicks
      // (status, batch M/A/E toggles, etc.) paint instantly instead of waiting
      // for the PATCH round-trip + refetch.
      const patch: Partial<LeadPublic> = {}
      const src = body as Record<string, unknown>
      for (const key of OPTIMISTIC_PATCH_FIELDS) {
        if (src[key] !== undefined) (patch as Record<string, unknown>)[key] = src[key]
      }
      if (Object.keys(patch).length === 0) return { previous: undefined, previousWb: undefined }

      await qc.cancelQueries({ queryKey: ['leads', 'list', 'paged'], exact: false })
      await qc.cancelQueries({ queryKey: ['workboard'] })
      await qc.cancelQueries({ queryKey: ['retarget'] })

      const previous = qc.getQueriesData({ queryKey: ['leads', 'list', 'paged'], exact: false })
      previous.forEach(([queryKey, data]) => {
        if (!isLeadsInfiniteData(data)) return
        qc.setQueryData(queryKey, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          })),
        })
      })

      const previousWb = qc.getQueriesData({ queryKey: ['workboard'] })
      const nextStatus = typeof patch.status === 'string' ? patch.status : undefined
      previousWb.forEach(([queryKey, data]) => {
        if (!isWorkboardData(data)) return
        // A status change must RELOCATE the card to its new column instantly. The
        // old in-place patch left the card sitting in its original column until the
        // refetch landed → on the workboard it looked like nothing happened, so
        // users re-clicked ("doesn't change in one try") and the move only showed
        // after a lag.
        const isMove =
          nextStatus !== undefined &&
          data.columns.some(
            (col) => col.status !== nextStatus && col.items.some((it) => it.id === id),
          )
        if (!isMove) {
          qc.setQueryData(queryKey, {
            ...data,
            columns: data.columns.map((col) => ({
              ...col,
              items: col.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            })),
          })
          return
        }
        // Pull the patched card out of its current column…
        let moved: LeadPublic | undefined
        const stripped = data.columns.map((col) => {
          const found = col.items.find((it) => it.id === id)
          if (!found) return col
          moved = { ...found, ...patch }
          return {
            ...col,
            total: Math.max(0, col.total - 1),
            items: col.items.filter((it) => it.id !== id),
          }
        })
        // …and drop it on top of the destination column (if that column is in view;
        // otherwise it just leaves this board and the refetch reconciles the rest).
        const columns = stripped.map((col) =>
          moved && col.status === nextStatus
            ? { ...col, total: col.total + 1, items: [moved, ...col.items] }
            : col,
        )
        qc.setQueryData(queryKey, { ...data, columns })
      })

      // Retarget list is a flat LeadListResponse — patch its row in place so the
      // status dropdown there reflects the change on the FIRST tap (was reverting
      // to the stale server value until the refetch landed → "update twice" bug).
      const previousRt = qc.getQueriesData({ queryKey: ['retarget'] })
      previousRt.forEach(([queryKey, data]) => {
        if (!isLeadListResponse(data)) return
        qc.setQueryData(queryKey, {
          ...data,
          items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })
      })

      return { previous, previousWb, previousRt }
    },
    onError: (_err, _variables, context) => {
      context?.previous?.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
      context?.previousWb?.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
      context?.previousRt?.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data)
      })
    },
    onSettled: () => {
      invalidateLeadRelated(qc)
    },
  })
}

export function useLeadRegisterLinkMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resend }: { id: number; resend?: boolean }) =>
      postLeadRegisterLink(id, resend),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads', 'list'] })
    },
  })
}

async function reassignLead(leadId: number, assignedToUserId: number): Promise<LeadPublic> {
  const res = await apiFetch(`/api/v1/leads/${leadId}/reassign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to_user_id: assignedToUserId }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function useReassignLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, userId }: { leadId: number; userId: number }) =>
      reassignLead(leadId, userId),
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
    onSuccess: () => {
      invalidateLeadRelated(qc)
      void qc.invalidateQueries({ queryKey: ['wallet'] })
    },
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
  paidStatus?: 'day1'
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
