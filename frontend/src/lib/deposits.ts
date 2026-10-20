/** Security deposit helpers shared by the deposit components and pages. */

export type PaymentDetailsDraft = { mode: string; ref: string; paidAt: string }

export const RECEIPT_STATUS_LABEL: Record<'held' | 'refunded' | 'cancelled', string> = {
  held: 'Held',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `datetime-local` value for "now" in the device's time zone. */
export function nowLocalInput(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function emptyPaymentDraft(): PaymentDetailsDraft {
  return { mode: 'upi', ref: '', paidAt: nowLocalInput() }
}

/** Mirrors the server check so the button only lights up when the details can pass. */
export function paymentDraftError(d: PaymentDetailsDraft): string | null {
  const ref = d.ref.replace(/\s+/g, '').toUpperCase()
  if (!d.mode) return 'Choose the payment mode.'
  if (!ref) return 'Enter the Transaction ID / Payment Ref No.'
  if (d.mode === 'upi' && !/^\d{12}$/.test(ref)) return 'UPI Ref No. (UTR) is the 12-digit number on the payment screen.'
  if (d.mode !== 'upi' && !/^[A-Z0-9][A-Z0-9/-]{5,39}$/.test(ref)) return 'Transaction ID should be 6–40 letters or digits.'
  if (!d.paidAt) return 'Enter the date and time of payment.'
  return null
}

export function paymentDraftBody(d: PaymentDetailsDraft) {
  return { payment_mode: d.mode, payment_ref: d.ref.trim(), paid_at: new Date(d.paidAt).toISOString() }
}
