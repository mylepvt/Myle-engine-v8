import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type LeadStatus =
  | 'new_lead'
  | 'contacted'
  | 'invited'
  | 'video_sent'
  | 'video_watched'
  | 'paid'
  | 'day1'
  | 'day2'
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
  { value: 'video_sent',     label: 'Video Sent' },
  { value: 'video_watched',  label: 'Video Watched' },
  { value: 'paid',           label: 'Paid ₹196' },
  { value: 'day1',           label: 'Day 1' },
  { value: 'day2',           label: 'Day 2' },
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

/** Statuses that count as "active pipeline" — shown in workboard kanban */
export const PIPELINE_STATUS_OPTIONS = LEAD_STATUS_OPTIONS.filter((o) =>
  ['new_lead','contacted','invited','video_sent','video_watched','paid',
   'day1','day2','interview','track_selected','seat_hold','converted','lost'].includes(o.value)
)

/** Won/closed statuses for metrics */
export const CLOSED_WON_STATUSES: LeadStatus[] = ['converted', 'seat_hold']
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
  { label: 'Pre-Enrollment', statuses: ['new_lead', 'contacted', 'invited', 'video_sent', 'video_watched'] },
  { label: 'Enrolled', statuses: ['paid', 'day1', 'day2', 'interview'] },
  { label: 'Closing', statuses: ['track_selected', 'seat_hold', 'converted'] },
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

const DEFAULT_PAGE_SIZE = 50

function buildLeadsQueryString(
  filters: LeadListFetchParams,
  listMode: LeadsListMode,
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
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

async function fetchLeads(
  filters: LeadListFetchParams,
  listMode: LeadsListMode,
): Promise<LeadListResponse> {
  const res = await apiFetch(`/api/v1/leads${buildLeadsQueryString(filters, listMode)}`)
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function createLead(name: string, status: LeadStatus = 'new'): Promise<LeadPublic> {
  const res = await apiFetch('/api/v1/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, status }),
  })
  if (!res.ok) {
    await parseError(res)
  }
  return res.json()
}

export async function patchLead(
  id: number,
  body: {
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
  },
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

export async function deleteLead(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/leads/${id}`, { method: 'DELETE' })
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

export function useLeadsQuery(
  enabled: boolean,
  filters: LeadListFilters,
  listMode: LeadsListMode = 'active',
) {
  return useQuery({
    queryKey: ['leads', 'list', listMode, filters.q.trim(), filters.status],
    queryFn: () => fetchLeads(filters, listMode),
    enabled,
  })
}

/** Paged list for Work → Leads (load more). */
export function useLeadsInfiniteQuery(
  enabled: boolean,
  filters: LeadListFilters,
  listMode: LeadsListMode = 'active',
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: ['leads', 'list', 'paged', listMode, filters.q.trim(), filters.status, pageSize],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLeads(
        { ...filters, limit: pageSize, offset: pageParam as number },
        listMode,
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
}

export function useCreateLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, status }: { name: string; status?: LeadStatus }) =>
      createLead(name, status ?? 'new'),
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

export function useClaimLeadMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimLead,
    onSuccess: () => invalidateLeadRelated(qc),
  })
}
