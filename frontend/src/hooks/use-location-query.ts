import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type TeamLocationEntry = {
  user_id: number
  name: string | null
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  city: string | null
  state: string | null
  updated_at: string | null
}

export type TeamLocationsResponse = {
  total: number
  items: TeamLocationEntry[]
}

export function useLocationPingMutation() {
  return useMutation({
    mutationFn: async (payload: {
      latitude?: number
      longitude?: number
      accuracy_meters?: number
      city?: string
      state?: string
    }) => {
      await apiFetch('/api/v1/location/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    onError: () => {},
  })
}

export function useTeamLocationsQuery(enabled = true) {
  return useQuery<TeamLocationsResponse>({
    queryKey: ['location', 'team'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/location/team')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<TeamLocationsResponse>
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 2 * 60 * 1000,
  })
}
