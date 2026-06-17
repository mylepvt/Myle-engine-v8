import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface CampaignMissionPublic {
  id: number
  item_key: string
  label: string
  target: number
  verification_required: boolean
  evidence_instructions: string | null
  sort_order: number
}

export interface CampaignPublic {
  id: number
  name: string
  description: string | null
  webinar_date: string | null
  expiry_date: string | null
  is_active: boolean
  missions: CampaignMissionPublic[]
  enrollment_count: number
  created_at: string
}

export interface CampaignMemberProgressPublic {
  id: number
  campaign_mission_id: number
  label: string
  target: number
  achieved: number
  evidence: string | null
  status: string
  verified_by_user_id: number | null
  verified_at: string | null
  rejection_reason: string | null
}

export interface CampaignEnrollmentPublic {
  id: number
  campaign_id: number
  user_id: number
  user_name: string | null
  status: string
  enrolled_at: string
  completed_at: string | null
  progress: CampaignMemberProgressPublic[]
}

export interface CampaignMetrics {
  attendance: number
  implementation: number
  implementation_pct: number
  success: number
  success_pct: number
  total_enrolled: number
  total_missions: number
}

const KEYS = {
  campaigns: ['training-campaigns'] as const,
  campaign: (id: number) => ['training-campaigns', id] as const,
  enrollments: (id: number) => ['training-campaigns', id, 'enrollments'] as const,
  metrics: (id: number) => ['training-campaigns', id, 'metrics'] as const,
  my: ['training-campaigns', 'my'] as const,
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

// ── Admin hooks ──────────────────────────────────────────────────

export function useCampaigns(activeOnly = true, enabled = true) {
  return useQuery({
    queryKey: [...KEYS.campaigns, { activeOnly }],
    queryFn: () => fetchJson<CampaignPublic[]>(`/api/v1/admin/campaigns?active_only=${activeOnly}`),
    enabled,
  })
}

export function useCampaign(campaignId: number, enabled = true) {
  return useQuery({
    queryKey: KEYS.campaign(campaignId),
    queryFn: () => fetchJson<CampaignPublic>(`/api/v1/admin/campaigns/${campaignId}`),
    enabled,
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/api/v1/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.campaigns }),
  })
}

export function useEnrollMembers(campaignId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userIds: number[]) =>
      apiFetch(`/api/v1/admin/campaigns/${campaignId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.campaign(campaignId) })
      qc.invalidateQueries({ queryKey: KEYS.enrollments(campaignId) })
    },
  })
}

export function useCampaignEnrollments(campaignId: number, enabled = true) {
  return useQuery({
    queryKey: KEYS.enrollments(campaignId),
    queryFn: () =>
      fetchJson<CampaignEnrollmentPublic[]>(`/api/v1/admin/campaigns/${campaignId}/enrollments`),
    enabled,
  })
}

export function useCampaignMetrics(campaignId: number, enabled = true) {
  return useQuery({
    queryKey: KEYS.metrics(campaignId),
    queryFn: () =>
      fetchJson<CampaignMetrics>(`/api/v1/admin/campaigns/${campaignId}/metrics`),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useVerifyCampaignProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { progress_id: number; approved: boolean; rejection_reason?: string }) =>
      apiFetch('/api/v1/campaigns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.campaigns }),
  })
}

// ── Member hooks ─────────────────────────────────────────────────

export function useMyCampaigns(enabled = true) {
  return useQuery({
    queryKey: KEYS.my,
    queryFn: () => fetchJson<CampaignEnrollmentPublic[]>('/api/v1/campaigns/my'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useSubmitCampaignProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { enrollment_id: number; campaign_mission_id: number; achieved: number; evidence?: string }) =>
      apiFetch('/api/v1/campaigns/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.my }),
  })
}
