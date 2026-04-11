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
  share_url: string
}

type EnrollShareLinkListResponse = {
  items: EnrollShareLink[]
  total: number
}

type GenerateShareLinkBody = {
  lead_id: number
  youtube_url?: string | null
  title?: string | null
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'detail' in err
      ? String((err as { detail?: string }).detail ?? res.statusText)
      : res.statusText
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
