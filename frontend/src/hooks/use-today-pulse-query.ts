import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type ReportStatusItem = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  submitted: boolean
  calls_in_report: number
}

export type ZeroActivityItem = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  presence_status: string
}

export type TodayPulseResponse = {
  calls_today: number
  leads_today: number
  flp_billing_count: number
  reports_submitted: number
  reports_total: number
  report_members: ReportStatusItem[]
  zero_activity: ZeroActivityItem[]
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
