/**
 * Tel / WhatsApp deep links.
 * `wa.me/{phone}?text=` is used — works with both personal WhatsApp and WhatsApp Business
 * on mobile (opens whichever app is installed) and desktop (WhatsApp Web / Desktop).
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

/** Opens WhatsApp chat — works with personal WhatsApp and WhatsApp Business. */
export function whatsAppChatHref(phone: string | null | undefined): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return `https://wa.me/${d}`
}

/** Same chat link with prefilled message — works with personal WhatsApp and WhatsApp Business. */
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
