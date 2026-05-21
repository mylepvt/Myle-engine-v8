import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
    staleTime: 10_000,
    // No refetchInterval needed — WebSocket topic "whatsapp_log" invalidates instantly
  })
}

// --- Mutations ---

async function sendCustomMessage(payload: { phone: string; message: string }) {
  const res = await apiFetch('/api/v1/webhooks/whatsapp/send-custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean; wa_message_id?: string; error?: string }>
}

async function triggerDailySummary(leader_user_id?: number) {
  const res = await apiFetch('/api/v1/webhooks/whatsapp/trigger-daily-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leader_user_id: leader_user_id ?? null }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean; sent_to: number; total_leaders?: number }>
}

export function useSendCustomMessageMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sendCustomMessage,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp', 'logs'] }),
  })
}

export function useTriggerDailySummaryMutation() {
  return useMutation({ mutationFn: triggerDailySummary })
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

export type LeaderPhoneItem = {
  id: number
  name: string
  phone_raw: string | null
  phone_normalized: string | null
  wa_enabled: boolean
}

export type LeadersPhoneResponse = {
  leaders: LeaderPhoneItem[]
  total: number
  wa_enabled: number
  no_phone: number
}

async function fetchLeadersPhone(): Promise<LeadersPhoneResponse> {
  const res = await apiFetch('/api/v1/webhooks/whatsapp/leaders')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useWhatsAppLeadersQuery(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp', 'leaders'],
    queryFn: fetchLeadersPhone,
    enabled,
    staleTime: 30_000,
  })
}

export type BroadcastResultItem = {
  user_id: number
  name: string
  phone_tail: string
  status: 'sent' | 'failed' | 'no_phone'
}

export type BroadcastResponse = {
  sent: number
  failed: number
  no_phone: number
  results: BroadcastResultItem[]
}

async function sendBroadcast(payload: { message: string; recipients: 'leaders' | 'team' | 'all' }) {
  const res = await apiFetch('/api/v1/webhooks/whatsapp/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<BroadcastResponse>
}

export function useSendBroadcastMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sendBroadcast,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp', 'logs'] }),
  })
}
