import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamReportsMember = {
  user_id: number
  member_name: string
  member_username: string | null
  member_email: string
  member_phone: string | null
  member_fbo_id: string
  member_role: string
  upline_name: string | null
  upline_fbo_id: string | null
}

export type TeamReportItem = TeamReportsMember & {
  report_id: number
  report_date: string
  submitted_at: string
  total_calling: number
  calls_picked: number
  wrong_numbers: number
  day1_count: number
  day2_count: number
  day3_count: number
  underage: number
  plan_2cc: number
  seat_holdings: number
  leads_educated: number
  pdf_covered: number
  calls_made_actual: number
  payments_actual: number
  remarks: string | null
  system_verified: boolean
}

export type TeamReportsLiveSummary = {
  leads_claimed_today: number
  calls_made_today: number
  flp_min_billing_today: number
  /** Enroll payment proofs approved today (Asia/Kolkata calendar day). */
  payment_proofs_approved_today: number
  day1_total: number
  day2_total: number
  converted_total: number
}

export type TeamReportsPayload = {
  items: TeamReportItem[]
  total: number
  missing_members: TeamReportsMember[]
  scope_total_members: number
  note: string | null
  date: string
  timezone: string
  live_summary: TeamReportsLiveSummary
}

async function fetchTeamReports(dateIso: string): Promise<TeamReportsPayload> {
  const q = new URLSearchParams()
  if (dateIso) q.set('date', dateIso)
  const res = await apiFetch(`/api/v1/team/reports?${q}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<TeamReportsPayload>
}

export function useTeamReportsQuery(dateIso: string, enabled = true) {
  return useQuery({
    queryKey: ['team', 'reports', dateIso],
    queryFn: () => fetchTeamReports(dateIso),
    enabled,
  })
}

export type TeamWorkTrendPoint = {
  date: string
  calls: number
  day1: number
  payments: number
  reporters: number
}

export type TeamWorkTrendResponse = {
  days: number
  points: TeamWorkTrendPoint[]
  total_calls: number
  total_day1: number
  total_payments: number
}

async function fetchTeamWorkTrend(days: number): Promise<TeamWorkTrendResponse> {
  const res = await apiFetch(`/api/v1/team/reports/trend?days=${days}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TeamWorkTrendResponse>
}

export function useTeamWorkTrendQuery(days: number, enabled = true) {
  return useQuery({
    queryKey: ['team', 'reports', 'trend', days],
    queryFn: () => fetchTeamWorkTrend(days),
    enabled,
  })
}
