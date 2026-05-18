import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type ReportStatusItem = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  submitted: boolean
  calls_in_report: number
  reminded: boolean
}

export type ZeroActivityItem = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  presence_status: string
}

export type ReminderResult = {
  user_id: number
  name: string
  phone_tail: string
  status: 'sent' | 'stub' | 'failed' | 'no_phone'
}

export type SendRemindersResponse = {
  sent: number
  failed: number
  no_phone: number
  results: ReminderResult[]
}

export type TodayPulseResponse = {
  calls_today: number
  leads_today: number
  flp_billing_count: number
  reports_submitted: number
  reports_total: number
  report_members: ReportStatusItem[]
  zero_activity: ZeroActivityItem[]
  reminded_user_ids: number[]
}

async function fetchTodayPulse(): Promise<TodayPulseResponse> {
  const res = await apiFetch('/api/v1/admin/today-pulse')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TodayPulseResponse>
}

export function useTodayPulseQuery(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'today-pulse'],
    queryFn: fetchTodayPulse,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
