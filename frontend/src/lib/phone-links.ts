/**
 * Tel / WhatsApp deep links.
 * `wa.me/{phone}?text=` — personal WhatsApp on mobile, WhatsApp Web/Desktop.
 * `https://www.whatsapp.com/contact/{phone}` — WhatsApp Business on mobile (if installed).
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

/** Opens personal WhatsApp chat via wa.me link. */
export function whatsAppChatHref(phone: string | null | undefined): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return `https://wa.me/${d}`
}

/** Opens WhatsApp Business chat (Android: WhatsApp Business app; Web: WhatsApp Web). */
export function whatsAppBusinessChatHref(phone: string | null | undefined): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return `https://www.whatsapp.com/contact/${d}`
}

/** Personal WhatsApp chat link with prefilled message. */
export function whatsAppChatWithTextHref(
  phone: string | null | undefined,
  text: string,
): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  const q = new URLSearchParams()
  q.set('text', text)
  return `https://wa.me/${d}?${q.toString()}`
}

/** WhatsApp Business chat link with prefilled message. */
export function whatsAppBusinessChatWithTextHref(
  phone: string | null | undefined,
  text: string,
): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  const q = new URLSearchParams()
  q.set('text', text)
  return `https://www.whatsapp.com/contact/${d}?${q.toString()}`
}
