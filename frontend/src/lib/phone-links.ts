/**
 * Tel / WhatsApp deep links. `api.whatsapp.com/send` is used instead of `wa.me` because
 * `wa.me` opens Chrome with a WhatsApp download page on desktop, whereas
 * `api.whatsapp.com/send` opens WhatsApp Web directly on desktop and WhatsApp app on mobile.
 */

/**
 * Digits for `wa.me/{digits}` — matches legacy Jinja `wa_phone` filter
 * (`backend/legacy/myle_dashboard/app.py` `wa_phone_filter`).
 */
export function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10 && /^[6789]/.test(d)) {
    return `91${d}`
  }
  if (d.startsWith('0') && d.length === 11) {
    return `91${d.slice(1)}`
  }
  return d
}

export function telHref(phone: string | null | undefined): string {
  if (!phone?.trim()) return '#'
  const t = phone.trim()
  if (t.startsWith('+')) return `tel:${t}`
  const d = whatsappDigits(phone)
  if (!d) return '#'
  return `tel:+${d}`
}

/** Opens WhatsApp chat (user can start a voice/video call from the chat screen). */
export function whatsAppChatHref(phone: string | null | undefined): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return `https://api.whatsapp.com/send?phone=${d}`
}

/** Same chat link with prefilled message (e.g. support). */
export function whatsAppChatWithTextHref(
  phone: string | null | undefined,
  text: string,
): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  const q = new URLSearchParams()
  q.set('phone', d)
  q.set('text', text)
  return `https://api.whatsapp.com/send?${q.toString()}`
}
