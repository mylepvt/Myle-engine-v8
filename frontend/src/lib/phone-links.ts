/**
 * Tel / WhatsApp deep links.
 *
 * Platform handling:
 * - Android: `intent://` scheme bypasses Chrome and opens WhatsApp app directly
 * - iOS: `whatsapp://` scheme opens WhatsApp app directly
 * - Desktop: `api.whatsapp.com/send` falls back to WhatsApp Web
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

function _isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

function _isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Opens WhatsApp chat (user can start a voice/video call from the chat screen). */
export function whatsAppChatHref(phone: string | null | undefined): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return _whatsAppUrl(d)
}

/** Same chat link with prefilled message (e.g. support). */
export function whatsAppChatWithTextHref(
  phone: string | null | undefined,
  text: string,
): string {
  const d = whatsappDigits(phone ?? '')
  if (!d) return '#'
  return _whatsAppUrl(d, text)
}

function _whatsAppUrl(digits: string, text?: string): string {
  if (_isAndroid()) {
    const msg = text ? `&text=${encodeURIComponent(text)}` : ''
    return `intent://send?phone=${digits}${msg}#Intent;scheme=whatsapp;package=com.whatsapp;end`
  }
  if (_isIOS()) {
    return `whatsapp://send?phone=${digits}${text ? `&text=${encodeURIComponent(text)}` : ''}`
  }
  // Desktop fallback — WhatsApp Web
  const q = new URLSearchParams()
  q.set('phone', digits)
  if (text) q.set('text', text)
  return `https://api.whatsapp.com/send?${q.toString()}`
}

/** Open WhatsApp in-app (use instead of <a href target=_blank> for PWA compatibility). */
export function openWhatsApp(phone: string | null | undefined, text?: string): void {
  const url = whatsAppChatWithTextHref(phone ?? '', text ?? '')
  if (url === '#') return
  window.location.href = url
}
