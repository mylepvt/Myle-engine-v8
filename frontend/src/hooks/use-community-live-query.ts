import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type CommunityFeedKind =
  | 'call'
  | 'lead'
  | 'followup'
  | 'batch'
  | 'day2'
  | 'training'
  | 'certificate'
  | 'report'
  | 'win'
  | 'star'
  | 'jackpot'

export type CommunityFeedItem = {
  kind: CommunityFeedKind
  user_id: number
  text: string
  at: string
}

export type CommunityTotals = {
  calls: number
  followups: number
  members_worked: number
  leads_added: number
}

export type CommunityLive = {
  online_now: number
  online_names: string[]
  /** Admin only — null for team and leaders. */
  today: CommunityTotals | null
  week: CommunityTotals | null
  /** Members with `star_calls`+ calls today, most calls first. */
  call_stars: { user_id: number; name: string; calls: number }[]
  star_calls: number
  feed: CommunityFeedItem[]
  generated_at: string
}

/** Community live pulse — refreshed every 30 s while the app is in front. */
export function useCommunityLiveQuery() {
  return useQuery<CommunityLive>({
    queryKey: ['community', 'live'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/community/live')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}
