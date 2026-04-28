import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type EnrollShareLink = {
  id: number
  token: string
  lead_id: number
  created_by_user_id: number
  youtube_url: string | null
  title: string | null
  view_count: number
  first_viewed_at: string | null
  last_viewed_at: string | null
  status_synced: boolean
  created_at: string
  expires_at: string | null
  share_url: string
  is_expired: boolean
}

type EnrollShareLinkListResponse = {
  items: EnrollShareLink[]
  total: number
}

export type EnrollmentVideoSendDelivery = {
  ok: boolean
  channel: string
  manual_share_url?: string | null
  message_preview?: string | null
  http_status?: number | null
  body_preview?: string | null
  error?: string | null
  detail?: string | null
}

export type EnrollmentVideoSendResponse = {
  link: EnrollShareLink
  delivery: EnrollmentVideoSendDelivery
}

type GenerateShareLinkBody = {
  lead_id: number
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  let msg = res.statusText
  if (typeof err === 'object' && err !== null) {
    if ('detail' in err && typeof (err as { detail?: unknown }).detail === 'string') {
      msg = String((err as { detail?: string }).detail || res.statusText)
    } else {
      const wrapped = (err as { error?: { message?: string } }).error?.message
      if (typeof wrapped === 'string' && wrapped.trim()) {
        msg = wrapped
      }
    }
  }
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchLeadShareLinks(leadId: number): Promise<EnrollShareLinkListResponse> {
  const res = await apiFetch(`/api/v1/enroll/lead/${leadId}`)
  if (!res.ok) await parseError(res)
  return res.json() as Promise<EnrollShareLinkListResponse>
}

async function postGenerateShareLink(body: GenerateShareLinkBody): Promise<EnrollShareLink> {
  const res = await apiFetch('/api/v1/enroll/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json() as Promise<EnrollShareLink>
}

async function postSendEnrollmentVideo(leadId: number): Promise<EnrollmentVideoSendResponse> {
  const res = await apiFetch('/api/v1/enroll/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId }),
  })
  if (!res.ok) await parseError(res)
  return res.json() as Promise<EnrollmentVideoSendResponse>
}

export function useLeadShareLinksQuery(leadId: number) {
  return useQuery({
    queryKey: ['enroll', 'lead', leadId],
    queryFn: () => fetchLeadShareLinks(leadId),
    enabled: leadId > 0,
  })
}

export function useGenerateShareLinkMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: GenerateShareLinkBody) => postGenerateShareLink(body),
    onSuccess: (_data, body) => {
      void qc.invalidateQueries({ queryKey: ['enroll', 'lead', body.lead_id] })
      void qc.invalidateQueries({ queryKey: ['lead-detail', body.lead_id] })
    },
  })
}

export function useSendEnrollmentVideoMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leadId: number) => postSendEnrollmentVideo(leadId),
    onSuccess: (_data, leadId) => {
      void qc.invalidateQueries({ queryKey: ['enroll', 'lead', leadId] })
      void qc.invalidateQueries({ queryKey: ['lead-detail', leadId] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['workboard'] })
    },
  })
}
