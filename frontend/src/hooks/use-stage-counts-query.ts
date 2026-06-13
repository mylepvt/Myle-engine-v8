import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type StageCounts = {
  counts: Record<string, number>
  today_movements: Record<string, number>
  total: number
  today_claimed?: number
}

async function fetchStageCounts(hours?: number): Promise<StageCounts> {
  const qs = hours != null ? `?hours=${hours}` : ''
  const res = await apiFetch(`/api/v1/execution/stage-counts${qs}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail ?? `HTTP ${res.status}`)
  return body as StageCounts
}

export function useStageCounts(enabled = true, hours?: number) {
  return useQuery({
    queryKey: ['execution', 'stage-counts', hours],
    queryFn: () => fetchStageCounts(hours),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
