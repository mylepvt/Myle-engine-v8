/**
 * Tel / WhatsApp deep links. `wa.me` opens the WhatsApp app for **consumer or Business** accounts
 * on the same number — there is no separate URL scheme for Business vs personal.
 */

/** Digits only, with a sensible default country code when the UI stores 10-digit local numbers. */
export function whatsappDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (!d) return ''
  // 10-digit local (common in IN) → assume +91; already includes country if 11+ digits
  if (d.length === 10 && !phone.trim().startsWith('+')) {
    return `91${d}`
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
  return `https://wa.me/${d}`
}

/** Same chat link with prefilled message (e.g. support). */
export function whatsAppChatWithTextHref(
  phone: string | null | undefined,
  text: string,
): string {
  const base = whatsAppChatHref(phone)
  if (base === '#') return '#'
  const q = new URLSearchParams()
  q.set('text', text)
  return `${base}?${q.toString()}`
}
