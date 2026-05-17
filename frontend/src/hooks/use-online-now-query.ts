import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type OnlineUserItem = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  presence_status: 'online' | 'idle'
  calls_today: number
  leads_today: number
  is_working: boolean
}

export type OnlineNowResponse = {
  online_count: number
  working_count: number
  not_working_count: number
  users: OnlineUserItem[]
}

async function fetchOnlineNow(): Promise<OnlineNowResponse> {
  const res = await apiFetch('/api/v1/admin/online-now')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<OnlineNowResponse>
}

export function useOnlineNowQuery(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'online-now'],
    queryFn: fetchOnlineNow,
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}
