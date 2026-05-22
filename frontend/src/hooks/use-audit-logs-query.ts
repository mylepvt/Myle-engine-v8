import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type AuditLogEntry = {
  id: number
  user_id: number
  actor: string
  action: string
  entity_type: string | null
  entity_id: number | null
  meta: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export type AuditLogsResponse = {
  items: AuditLogEntry[]
  total: number
  page: number
  page_size: number
  pages: number
}

export type AuditLogsParams = {
  page?: number
  page_size?: number
  days?: number
  action?: string
  user_id?: number
}

export function useAuditLogsQuery(params: AuditLogsParams = {}) {
  const { page = 1, page_size = 50, days = 30, action, user_id } = params

  const qs = new URLSearchParams()
  qs.set('page', String(page))
  qs.set('page_size', String(page_size))
  qs.set('days', String(days))
  if (action) qs.set('action', action)
  if (user_id) qs.set('user_id', String(user_id))

  return useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/analytics/activity-log?${qs}`)
      const raw: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = messageFromApiErrorPayload(raw, res.statusText)
        throw new Error(msg || `HTTP ${res.status}`)
      }
      return raw as AuditLogsResponse
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
