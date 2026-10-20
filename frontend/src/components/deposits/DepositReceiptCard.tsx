import { useState } from 'react'
import { Download, FileText, MessageCircle, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RECEIPT_STATUS_LABEL, formatIst } from '@/lib/deposits'
import { downloadReceiptPdf, sharePdfFile, shareReceiptOnWhatsApp } from '@/lib/deposit-share'
import type { DepositReceipt } from '@/hooks/use-deposits-query'

export function ReceiptStatusPill({ status }: { status: DepositReceipt['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-ds-caption font-semibold',
        status === 'held' && 'bg-success/10 text-success-ink',
        status === 'refunded' && 'bg-warning/15 text-warning-ink',
        status === 'cancelled' && 'bg-destructive/10 text-destructive-ink',
      )}
    >
      {RECEIPT_STATUS_LABEL[status]}
    </span>
  )
}

/** One deposit receipt with Download / Share on WhatsApp / Send PDF. */
export function DepositReceiptCard({ receipt }: { receipt: DepositReceipt }) {
  const [busy, setBusy] = useState<'pdf' | 'file' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run(kind: 'pdf' | 'file') {
    setErr(null)
    setMsg(null)
    setBusy(kind)
    try {
      if (kind === 'pdf') await downloadReceiptPdf(receipt)
      else if ((await sharePdfFile(receipt)) === 'downloaded') setMsg('Sharing files is not supported here, so the PDF was downloaded.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get the PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-muted/60 p-3 text-ds-caption">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="break-all font-mono">{receipt.receipt_number}</span>
          </p>
          <p className="mt-0.5 text-muted-foreground">
            ₹{receipt.amount_rupees} · {receipt.payment_mode_label} · {receipt.payment_ref}
          </p>
          <p className="text-muted-foreground">Paid {formatIst(receipt.paid_at)}</p>
          {receipt.status === 'refunded' ? (
            <p className="text-warning-ink">
              Refunded {formatIst(receipt.refunded_at)} · {receipt.refund_ref}
            </p>
          ) : null}
          {receipt.consent_state === 'withdrawn' ? (
            <p className="font-semibold text-destructive-ink">The lead withdrew consent — refund is due.</p>
          ) : null}
        </div>
        <ReceiptStatusPill status={receipt.status} />
      </div>
      {receipt.status !== 'cancelled' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('pdf')}>
            <Download className="size-3.5" aria-hidden /> {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setErr(null)
              try {
                shareReceiptOnWhatsApp(receipt)
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not open WhatsApp')
              }
            }}
          >
            <MessageCircle className="size-3.5" aria-hidden /> Share on WhatsApp
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('file')}>
            <Share2 className="size-3.5" aria-hidden /> {busy === 'file' ? 'Preparing…' : 'Send PDF file'}
          </Button>
        </div>
      ) : null}
      {msg ? <p className="text-muted-foreground">{msg}</p> : null}
      {err ? <p className="text-destructive">{err}</p> : null}
    </div>
  )
}
