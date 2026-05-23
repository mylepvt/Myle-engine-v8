import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type Day1SlotsData = {
  date: string
  '5pm': number
  '6pm': number
  '7pm': number
  total: number
}

export function useDay1SlotsQuery(enabled = true) {
  return useQuery<Day1SlotsData>({
    queryKey: ['execution', 'day1-slots'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/execution/day1-slots')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Day1SlotsData>
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
