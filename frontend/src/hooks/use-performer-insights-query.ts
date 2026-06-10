import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type PerformerBreakdown = {
  consistency: number
  call_activity: number
  pickup_rate: number
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

export type SuggestedMember = {
  rank: number
  user_id: number
  name: string
  fbo_id: string
  phone: string
  composite_score: number
  tier: string
  reason: string
}

export type SuggestedGroup = {
  elite: SuggestedMember[]
  strong: SuggestedMember[]
  total_count: number
  all_phones: string[]
  whatsapp_group_intro: string
}

export type PerformerInsightItem = {
  rank: number
  user_id: number
  name: string
  fbo_id: string
  role: string
  phone: string
  composite_score: number
  breakdown: PerformerBreakdown
  tier: string
  tier_desc: string
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
  median_score: number
  tier_distribution: Record<string, number>
  suggested_group: SuggestedGroup
  performers: PerformerInsightItem[]
}

async function fetchPerformerInsights(
  days = 30,
  minReports = 1,
): Promise<PerformerInsightsResponse> {
  const res = await apiFetch(
    `/api/v1/admin/performer-insights?days=${days}&min_reports=${minReports}`,
  )
  if (!res.ok) {
    throw new Error(`Performer insights HTTP ${res.status}`)
  }
  return res.json()
}

export function usePerformerInsightsQuery(
  days = 30,
  minReports = 1,
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin', 'performer-insights', days, minReports],
    queryFn: () => fetchPerformerInsights(days, minReports),
    enabled,
    staleTime: 60_000,
  })
}
