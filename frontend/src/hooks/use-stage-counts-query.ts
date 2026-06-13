import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type StageCounts = {
  counts: Record<string, number>
  today_movements: Record<string, number>
  total: number
  today_claimed?: number
  previous_movements?: Record<string, number>
  previous_claimed?: number
}

async function fetchStageCounts(hours?: number, range?: string): Promise<StageCounts> {
  const p = new URLSearchParams()
  if (hours != null) p.set('hours', String(hours))
  if (range != null) p.set('range', range)
  const qs = p.toString()
  const res = await apiFetch(`/api/v1/execution/stage-counts${qs ? `?${qs}` : ''}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail ?? `HTTP ${res.status}`)
  return body as StageCounts
}

export function useStageCounts(enabled = true, hours?: number, range?: string) {
  return useQuery({
    queryKey: ['execution', 'stage-counts', hours, range],
    queryFn: () => fetchStageCounts(hours, range),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
