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

const ZOOM_URL = /https?:\/\/[^\s<>"']*zoom\.us\/[^\s<>"']+/i
const ANY_URL = /https?:\/\/[^\s<>"']+/i

/** First Zoom (else any) URL in pasted text — admins may paste Zoom's whole "Copy Invitation". */
export function extractJoinUrl(text: string | null | undefined): string {
  const t = (text ?? '').trim()
  return (t.match(ZOOM_URL) ?? t.match(ANY_URL))?.[0] ?? t
}

/** "Passcode: 331434" / "Password 331434" anywhere in the text, or a bare passcode. */
export function extractPasscode(text: string | null | undefined): string {
  const t = (text ?? '').trim()
  const labelled = t.match(/(?:passcode|password)\s*[:-]?\s*([A-Za-z0-9@#$*.^_-]{3,20})/i)
  if (labelled) return labelled[1]
  return /^[A-Za-z0-9@#$*.^_-]{3,20}$/.test(t) ? t : ''
}

/** Zoom meeting ID from the join link (`/j/89026736623`), grouped like Zoom shows it: 890 2673 6623. */
export function zoomMeetingId(url: string | null | undefined): string {
  const digits = (url ?? '').match(/zoom\.us\/(?:j|w|wc\/join)\/(\d{9,11})/i)?.[1]
  if (!digits) return ''
  return digits.length === 11
    ? `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
    : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

/**
 * The daily 2 PM session message, word for word as the team shares it on
 * WhatsApp. Only the join link (and the Meeting ID / Passcode that come with
 * it) change day to day; everything else is fixed here on purpose.
 * Trailing spaces are part of the original text and kept as-is.
 */
export function buildLiveSessionMessage(href: string, passcode?: string | null): string {
  const meetingId = zoomMeetingId(href)
  const pass = (passcode ?? '').trim()
  const lines = [
    // emoji-ok: WhatsApp message text shared by the member
    '*✨ WELCOME TO TODAY’S SESSION ✨* ',
    '',
    // emoji-ok: WhatsApp message text shared by the member
    '📌 *Today’s Topic* ',
    'What Will Be Your Exact Work?',
    '(Clear understanding of the work & system)',
    '',
    'By One & Only',
    // emoji-ok: WhatsApp message text shared by the member
    '🔥 *Mr. Suraj Rathod* 🔥',
    'https://www.instagram.com/surajrathod.in?igsh=Y2lnc3h0bW13bjdo&utm_source=qr',
    '',
    // emoji-ok: WhatsApp message text shared by the member
    '🏆 *Achievements:* FLP Youngest Manager | Top 5 FBO (India) | Car Plan L2 | MR L3',
    '',
    // emoji-ok: WhatsApp message text shared by the member
    '📍 *Platform: Zoom*',
    // emoji-ok: WhatsApp message text shared by the member
    '*👉 Join Here:* ',
    '',
    href,
    '',
  ]
  if (meetingId) lines.push(`Meeting ID: ${meetingId}`)
  if (pass) lines.push(`Passcode:  ${pass}`)
  if (meetingId || pass) lines.push('')
  lines.push(
    // emoji-ok: WhatsApp message text shared by the member
    '*⏰ Time: 2:00 PM*',
    '',
    // emoji-ok: WhatsApp message text shared by the member
    '🚀 Clarity + Action = Growth',
  )
  return lines.join('\n')
}
