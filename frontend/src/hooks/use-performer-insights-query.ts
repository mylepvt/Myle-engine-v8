import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type PerformerBreakdown = {
  consistency: number
  call_activity: number
  lead_education: number
  pipeline_conversion: number
  results: number
}

export type PerformerMetrics = {
  submission_days: number
  total_calls: number
  calls_picked: number
  pickup_rate: number
  avg_daily_calls: number
  leads_educated: number
  pipeline_total: number
  payments: number
  leads_taken: number
  converted_leads: number
  paid_leads: number
}

export type PerformerInsightItem = {
  rank: number
  user_id: number
  name: string
  fbo_id: string
  role: string
  composite_score: number
  breakdown: PerformerBreakdown
  metrics: PerformerMetrics
  trend: string
  trend_pct: number
}

export type PerformerInsightsResponse = {
  period_days: number
  period_start: string
  period_end: string
  total_members: number
  active_members: number
  top_performer_count: number
  average_score: number
  performers: PerformerInsightItem[]
}

async function fetchPerformerInsights(days = 30, minReports = 1): Promise<PerformerInsightsResponse> {
  const res = await apiFetch(`/api/v1/admin/performer-insights?days=${days}&min_reports=${minReports}`)
  if (!res.ok) {
    throw new Error(`Performer insights HTTP ${res.status}`)
  }
  return res.json()
}

export function usePerformerInsightsQuery(days = 30, minReports = 1, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'performer-insights', days, minReports],
    queryFn: () => fetchPerformerInsights(days, minReports),
    enabled,
    staleTime: 60_000,
  })
}
