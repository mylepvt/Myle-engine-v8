/** Day 3 slot deadline helpers (countdown parts, labels, quick picks). */

export const pad = (n: number) => String(n).padStart(2, '0')

export function remainingParts(deadline: Date, now: Date) {
  const ms = Math.max(0, deadline.getTime() - now.getTime())
  const total = Math.floor(ms / 1000)
  return { done: ms === 0, h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

/** "7:00 PM, today" / "11:00 AM, tomorrow" / "11:00 AM, Tue 6 Oct" */
export function deadlineLabel(deadline: Date, now = new Date()): string {
  const time = deadline.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(deadline, now)) return `${time}, today`
  if (sameDay(deadline, tomorrow)) return `${time}, tomorrow`
  return `${time}, ${deadline.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`
}

/** Quick picks; past "today" times are skipped. */
export function quickPicks(now = new Date()): { label: string; at: Date }[] {
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now)
    d.setDate(now.getDate() + dayOffset)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const picks = [
    { label: 'In 2 hours', at: new Date(now.getTime() + 2 * 3600_000) },
    { label: '6 PM today', at: at(0, 18) },
    { label: '7 PM today', at: at(0, 19) },
    { label: 'Tomorrow 11 AM', at: at(1, 11) },
  ]
  return picks.filter((p) => p.at.getTime() > now.getTime() + 5 * 60_000)
}
