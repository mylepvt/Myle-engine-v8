import { whatsappDigits } from '@/lib/phone-links'

export function buildDay2BusinessTestWhatsAppUrl({
  leadName,
  phone,
  testUrl,
}: {
  leadName: string | null | undefined
  phone: string | null | undefined
  testUrl?: string | null
}): string | null {
  const digits = whatsappDigits(phone ?? '')
  if (!digits) return null

  const name = (leadName || 'Participant').trim() || 'Participant'
  const lines = [
    `Hi ${name}, your Day 2 batches are complete.`,
    testUrl
      ? 'Please complete your Day 2 business evaluation using this link:'
      : 'Your Day 2 business evaluation is separate from the 7-day training test.',
    testUrl || 'Coordinator will share the business evaluation link separately.',
  ]

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`
}
