import { useQuery } from '@tanstack/react-query'

import { normalizeShellStubResponse } from '@/hooks/use-shell-stub-query'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type AnalyticsSurface = 'activity-log'

export type AnalyticsStubResponse = {
  items: Record<string, unknown>[]
  total: number
  note: string | null
}

const PATHS: Record<AnalyticsSurface, string> = {
  'activity-log': '/api/v1/analytics/activity-log',
}

async function fetchAnalyticsSurface(surface: AnalyticsSurface): Promise<AnalyticsStubResponse> {
  const res = await apiFetch(PATHS[surface])
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = messageFromApiErrorPayload(raw, res.statusText)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return normalizeShellStubResponse(raw)
}

export function useAnalyticsSurfaceQuery(surface: AnalyticsSurface, enabled = true) {
  return useQuery({
    queryKey: ['analytics', surface],
    queryFn: () => fetchAnalyticsSurface(surface),
    enabled,
    staleTime: 45_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
  })
}
