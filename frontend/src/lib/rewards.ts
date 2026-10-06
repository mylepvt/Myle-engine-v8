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

export type WheelSlice = { key: string; label: string; tickets: number; start: number; end: number; userId: number | null }

const MAX_SLICES = 12

/** Wheel slices (degrees, clockwise from the top), sized by tickets. Small entries beyond
 * MAX_SLICES merge into "Others", but the winner always keeps a slice of their own. */
export function wheelSlices(
  entries: { user_id: number; name: string; tickets: number }[],
  winnerId: number | null = null,
): WheelSlice[] {
  const sorted = [...entries].filter((e) => e.tickets > 0).sort((a, b) => b.tickets - a.tickets)
  let keep = sorted.slice(0, MAX_SLICES)
  const winner = sorted.find((e) => e.user_id === winnerId)
  if (winner && !keep.includes(winner)) keep = [...keep.slice(0, MAX_SLICES - 1), winner]
  const rest = sorted.filter((e) => !keep.includes(e))
  const parts = keep.map((e) => ({ key: `u${e.user_id}`, label: e.name, tickets: e.tickets, userId: e.user_id as number | null }))
  if (rest.length) {
    parts.push({ key: 'others', label: `+${rest.length} more`, tickets: rest.reduce((s, e) => s + e.tickets, 0), userId: null })
  }
  const total = parts.reduce((s, p) => s + p.tickets, 0)
  let at = 0
  return parts.map((p) => {
    const start = at
    at += (p.tickets / total) * 360
    return { ...p, start, end: at }
  })
}

/** Rotation that brings the winner's slice centre under the top pointer after `turns` spins. */
export function spinRotation(slices: WheelSlice[], winnerId: number, turns = 6): number {
  const s = slices.find((x) => x.userId === winnerId)
  if (!s) return turns * 360
  const centre = (s.start + s.end) / 2
  return turns * 360 + ((360 - centre) % 360)
}

/** "8%" chance for `mine` tickets out of the wheel's total. */
export function chanceLabel(mine: number, total: number): string | null {
  if (!mine || !total) return null
  const pct = (mine / total) * 100
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
}
