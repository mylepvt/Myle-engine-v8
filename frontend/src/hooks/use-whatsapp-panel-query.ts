import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type WhatsAppLogItem = {
  id: number
  created_at: string
  direction: 'in' | 'out'
  message_type: string
  phone: string | null
  message_preview: string | null
  status: 'sent' | 'failed' | 'received' | string
  error: string | null
  wa_message_id: string | null
  related_user_id: number | null
}

export type WhatsAppLogResponse = {
  items: WhatsAppLogItem[]
  total: number
  sent_today: number
  failed_today: number
  received_today: number
}

export type WhatsAppStatusResponse = {
  configured: boolean
  connected: boolean | null
  display_phone_number: string | null
  verified_name: string | null
  error: string | null
}

export type LogFilters = {
  direction?: 'in' | 'out' | ''
  status?: 'sent' | 'failed' | 'received' | ''
  message_type?: string
  limit?: number
  offset?: number
}

async function fetchLogs(filters: LogFilters): Promise<WhatsAppLogResponse> {
  const params = new URLSearchParams()
  if (filters.direction) params.set('direction', filters.direction)
  if (filters.status) params.set('status', filters.status)
  if (filters.message_type) params.set('message_type', filters.message_type)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))
  const qs = params.toString()
  const res = await apiFetch(`/api/v1/webhooks/whatsapp/logs${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchStatus(): Promise<WhatsAppStatusResponse> {
  const res = await apiFetch('/api/v1/webhooks/whatsapp/status')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useWhatsAppLogsQuery(filters: LogFilters, enabled = true) {
  return useQuery({
    queryKey: ['whatsapp', 'logs', filters],
    queryFn: () => fetchLogs(filters),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useWhatsAppStatusQuery(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: fetchStatus,
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
