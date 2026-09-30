const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const IST_DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatLiveSessionUpdatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : IST_DATE_TIME.format(d)
}

/** WhatsApp-ready message: today's date, title, schedule (ID / passcode) and the join link. */
export function buildLiveSessionMessage(
  item: { title?: string | null; detail?: string | null },
  href: string,
  today: Date = new Date(),
): string {
  const lines = [`🔴 *Today's Live Session* — ${IST_DATE.format(today)}`]
  const title = item.title?.trim()
  if (title && title !== "Today's Live Session") lines.push(`*${title}*`)
  const detail = item.detail?.trim()
  if (detail) lines.push(detail)
  lines.push('', `👉 Join here: ${href}`)
  return lines.join('\n')
}
