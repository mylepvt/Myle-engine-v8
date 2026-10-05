import type { CommunityLive } from '@/hooks/use-community-live-query'

/** Below this many calls today the card shows the (real) 7-day totals instead. */
export const TODAY_MIN_CALLS = 25
/** "N online" is only worth showing once a few people are on. */
export const MIN_ONLINE_SHOWN = 3

export function onlineLine(live: CommunityLive): string | null {
  const n = live.online_now
  if (n < MIN_ONLINE_SHOWN) return null
  const names = live.online_names.slice(0, 2)
  const others = n - names.length
  const who = others > 0 ? `${names.join(', ')} and ${others} more` : names.join(' and ')
  return `${who} are working right now`
}

/** Today's totals once the day has picked up, otherwise the last 7 days. Zero tiles are dropped. */
export function pickStats(live: CommunityLive): { period: string; stats: { value: number; label: string }[] } {
  const useToday = live.today.calls >= TODAY_MIN_CALLS
  const t = useToday ? live.today : live.week
  const stats = [
    { value: t.calls, label: 'Calls' },
    { value: t.leads_added, label: 'New leads' },
    { value: t.followups, label: 'Follow-ups' },
    { value: t.members_worked, label: 'Members working' },
  ].filter((s) => s.value > 0)
  return { period: useToday ? 'Today' : 'This week', stats: stats.slice(0, 3) }
}
