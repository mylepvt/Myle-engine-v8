import { apiFetch } from '@/lib/api'
import { openExternalShareUrl } from '@/lib/external-share-window'
import { whatsappDigits } from '@/lib/phone-links'

type EnrollmentLead = { id: number; name?: string | null; phone?: string | null }

/**
 * Send the single Enrollment-Live token /watch link over WhatsApp.
 *
 * No time-slot picker — the backend `/flp-min-billing/send` creates one open token
 * link (detail-form gate + first-open timer) and moves the lead to `video_sent`.
 * (Day-1/Day-2 batch sharing uses the M/A/E batch buttons, not live-session slots.)
 */
export async function sendEnrollmentLiveLink(lead: EnrollmentLead): Promise<void> {
  const res = await apiFetch('/api/v1/flp-min-billing/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: lead.id }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { detail?: string; error?: { message?: string } }
      | null
    throw new Error(body?.detail || body?.error?.message || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { link?: { share_url?: string } }
  const share = data.link?.share_url
  const watchUrl = share ? `${window.location.origin}${share}` : null
  if (!watchUrl) return
  const digits = whatsappDigits(lead.phone ?? '')
  if (!digits) throw new Error('Phone number missing for WhatsApp share.')
  const msg =
    `Hi ${lead.name || 'there'},\n\n` +
    `Aapki Enrollment-Live video ready hai. Is link pe apna naam aur registered number daal ke dekhiye:\n${watchUrl}`
  openExternalShareUrl(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`)
}
