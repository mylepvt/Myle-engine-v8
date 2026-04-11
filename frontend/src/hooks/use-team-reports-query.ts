import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamReportsLiveSummary = {
  leads_claimed_today: number
  calls_made_today: number
  enrolled_today: number
  day1_total: number
  day2_total: number
  converted_total: number
}

export type TeamReportsPayload = {
  items: Record<string, unknown>[]
  total: number
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

export function useTeamReportsQuery(dateIso: string) {
  return useQuery({
    queryKey: ['team', 'reports', dateIso],
    queryFn: () => fetchTeamReports(dateIso),
  })
}
