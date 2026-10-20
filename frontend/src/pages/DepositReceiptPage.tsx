import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'

import { depositPublic } from '@/hooks/use-deposits-query'
import { saveBlob } from '@/lib/deposit-share'

type Info = Awaited<ReturnType<typeof depositPublic.receiptInfo>>

/** The lead's own receipt link (sent on WhatsApp): their mobile number downloads the PDF. */
export function DepositReceiptPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    depositPublic
      .receiptInfo(token)
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
  }, [token])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 text-card-foreground shadow-lg">
        {loadError ? (
          <div>
            <p className="text-lg font-semibold text-foreground">Link not available</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : !info ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              setBusy(true)
              depositPublic
                .receiptPdf(token, phone)
                .then((blob) => {
                  saveBlob(blob, `${info.receipt_number}.pdf`)
                  setDone(true)
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false))
            }}
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm text-muted-foreground">{info.business_name}</p>
                <h1 className="text-lg font-semibold text-foreground">Refundable Security Deposit Receipt</h1>
                <p className="font-mono text-sm text-muted-foreground">{info.receipt_number}</p>
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Your mobile number (ends with {info.masked_phone.slice(-4)})
              </span>
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="field-input"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {done ? <p className="text-sm text-success-ink">Downloaded. Check your downloads.</p> : null}
            <button
              type="submit"
              disabled={busy || phone.replace(/\D/g, '').length < 10}
              className="btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Preparing…' : 'Download receipt (PDF)'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
