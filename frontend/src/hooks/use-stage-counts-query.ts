import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type StageCounts = {
  counts: Record<string, number>
  today_movements: Record<string, number>
  total: number
}

async function fetchStageCounts(): Promise<StageCounts> {
  const res = await apiFetch('/api/v1/execution/stage-counts')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail ?? `HTTP ${res.status}`)
  return body as StageCounts
}

export function useStageCounts(enabled = true) {
  return useQuery({
    queryKey: ['execution', 'stage-counts'],
    queryFn: fetchStageCounts,
    enabled,
    staleTime: 15_000,
  })
}
