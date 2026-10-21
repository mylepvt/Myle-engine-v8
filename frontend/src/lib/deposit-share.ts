import { apiFetch } from '@/lib/api'
import { openExternalShareUrl } from '@/lib/external-share-window'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { whatsappDigits } from '@/lib/phone-links'
import type { DepositReceipt } from '@/hooks/use-deposits-query'

/**
 * Security deposit links sent to the PROSPECT over personal WhatsApp (wa.me — no paid API).
 * The message text is intentionally Hinglish (prospect's language); app UI stays English.
 */

export function depositConsentUrl(token: string): string {
  return `${window.location.origin}/deposit/consent/${token}`
}

export function depositReceiptUrl(shareToken: string): string {
  return `${window.location.origin}/deposit/receipt/${shareToken}`
}

export function depositConsentMessage(name: string | null | undefined, amountRupees: number, url: string): string {
  return (
    `Hi ${name || 'there'} ji,\n\n` +
    // emoji-ok: prospect-facing WhatsApp message text
    `Myle Community mein aapka swagat hai! 🙏\n\n` +
    `Enrollment confirm karne ke liye ₹${amountRupees} ka ek chhota security deposit hota hai.\n\n` +
    `Payment se pehle bas ek baar is link par details dekh lijiye aur "I Agree" kar dijiye (1 minute lagega):\n${url}\n\n` +
    `Koi bhi sawaal ho to bejhijhak poochiye.`
  )
}

export function depositReceiptMessage(
  name: string | null | undefined,
  amountRupees: number,
  receiptNumber: string,
  url: string,
): string {
  return (
    `Hi ${name || 'there'} ji,\n\n` +
    // emoji-ok: prospect-facing WhatsApp message text
    `Aapka ₹${amountRupees} ka security deposit mil gaya hai, dhanyavaad! 🙏\n\n` +
    `Aapki receipt (${receiptNumber}) yahan hai, apna mobile number daal kar download kar lijiye:\n${url}\n\n` +
    `Myle Community family mein aapka swagat hai!`
  )
}

function openWhatsApp(phone: string | null | undefined, text: string): void {
  const digits = whatsappDigits(phone ?? '')
  if (!digits) throw new Error("The lead's mobile number is missing.")
  openExternalShareUrl(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`)
}

export function shareConsentOnWhatsApp(lead: { name?: string | null; phone?: string | null }, amountRupees: number, token: string) {
  openWhatsApp(lead.phone, depositConsentMessage(lead.name, amountRupees, depositConsentUrl(token)))
}

export function shareReceiptOnWhatsApp(receipt: DepositReceipt) {
  openWhatsApp(
    receipt.lead_phone,
    depositReceiptMessage(receipt.lead_name, receipt.amount_rupees, receipt.receipt_number, depositReceiptUrl(receipt.share_token)),
  )
}

async function receiptBlob(receipt: DepositReceipt): Promise<Blob> {
  const res = await apiFetch(receipt.pdf_path)
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  return res.blob()
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadReceiptPdf(receipt: DepositReceipt): Promise<void> {
  saveBlob(await receiptBlob(receipt), `${receipt.receipt_number}.pdf`)
}

/** Phone share sheet with the PDF attached (pick WhatsApp there); falls back to a download. */
export async function sharePdfFile(receipt: DepositReceipt): Promise<'shared' | 'downloaded'> {
  const blob = await receiptBlob(receipt)
  const file = new File([blob], `${receipt.receipt_number}.pdf`, { type: 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: receipt.receipt_number })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  saveBlob(blob, file.name)
  return 'downloaded'
}

export { saveBlob }
