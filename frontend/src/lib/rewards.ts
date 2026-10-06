import type { MyRewards, RewardPoint } from '@/hooks/use-rewards-query'

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

/** "3h 12m" / "12m" until the draw; "now" once it is due. */
export function untilDraw(drawAt: string, now: number): string {
  const ms = new Date(drawAt).getTime() - now
  if (ms <= 0) return 'now'
  const mins = Math.ceil(ms / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

export function ticketLine(r: MyRewards): string {
  if (r.tickets >= r.max_tickets) return `Max ${r.max_tickets} tickets — you're fully in today's draw`
  return `${r.next_ticket_in} MP more for ${r.tickets ? 'another' : 'your first'} ticket`
}

const SEEN_KEY = 'myle.rewards.lastSeenPointId'

/** Points earned since the last visit (to toast), and remembers the newest one. */
export function takeNewPoints(recent: RewardPoint[]): RewardPoint[] {
  const live = recent.filter((p) => !p.revoked)
  const newest = live.reduce((m, p) => Math.max(m, p.id), 0)
  let seen: number | null = null
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    seen = raw == null ? null : Number(raw)
    if (newest) window.localStorage.setItem(SEEN_KEY, String(Math.max(newest, seen ?? 0)))
  } catch {
    return []
  }
  if (seen == null) return [] // first visit: don't replay history
  return live.filter((p) => p.id > seen!).sort((a, b) => a.id - b.id)
}

/** "Power Hour on — 2× until 7:00 PM" / "Power Hour 6:00–7:00 PM: steps count 2×". */
export function powerHourLine(ph: NonNullable<MyRewards['power_hour']>, now: number): string | null {
  if (!ph.enabled) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  if (ph.active) return `Power Hour is on — every step counts 2× until ${fmt(ph.end)}`
  if (new Date(ph.end).getTime() <= now) return null
  return `Power Hour ${fmt(ph.start)}–${fmt(ph.end)}: steps count 2×`
}

export function streakLine(s: NonNullable<MyRewards['streak']>): string {
  if (s.doubled) return `${s.days}-day streak — your tickets count double today`
  if (s.days === 0) return `Earn a ticket ${s.goal} days in a row to double your tickets`
  const left = s.goal - s.days
  return `${s.days}-day streak — ${left} more day${left === 1 ? '' : 's'} for double tickets`
}

export function monthName(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'long' })
}
