import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type RemovalOutreachItem = {
  id: number
  user_id: number
  phone: string | null
  member_name: string
  removal_reason: string | null
  send_status: 'pending' | 'sent' | 'failed' | 'stub' | string
  sent_at: string | null
  manual_share_url: string | null
  reply_text: string | null
  replied_at: string | null
  created_at: string
}

export type RemovalOutreachResponse = {
  items: RemovalOutreachItem[]
  total: number
}

async function fetchRemovalOutreach(repliedOnly: boolean): Promise<RemovalOutreachResponse> {
  const qs = repliedOnly ? '?replied_only=true' : ''
  const res = await apiFetch(`/api/v1/team/removal-outreach${qs}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: string }).detail)
        : `HTTP ${res.status}`,
    )
  }
  return res.json()
}

export function useRemovalOutreachQuery(repliedOnly = false, enabled = true) {
  return useQuery({
    queryKey: ['team', 'removal-outreach', repliedOnly],
    queryFn: () => fetchRemovalOutreach(repliedOnly),
    enabled,
    staleTime: 30_000,
  })
}

async function sendRemovalOutreach(userId: number): Promise<RemovalOutreachItem> {
  const res = await apiFetch(`/api/v1/team/removal-outreach/${userId}/send`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: string }).detail)
        : `HTTP ${res.status}`,
    )
  }
  return res.json()
}

export function useSendRemovalOutreachMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sendRemovalOutreach,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'removal-outreach'] })
    },
  })
}
