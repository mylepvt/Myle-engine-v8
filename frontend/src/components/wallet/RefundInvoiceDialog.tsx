import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBackClose } from '@/hooks/use-back-close'
import { useInvoiceRefundableQuery, useRefundInvoiceMutation } from '@/hooks/use-invoices-query'

/**
 * Admin: refund leads from a tax invoice. Money goes back to the member's wallet, a GST
 * credit note is issued against the invoice, and (optionally) the leads go back to the pool.
 */
export function RefundInvoiceDialog({ invoiceNumber, onClose }: { invoiceNumber: string | null; onClose: () => void }) {
  const open = invoiceNumber != null
  const { data, isPending, isError } = useInvoiceRefundableQuery(invoiceNumber)
  const refund = useRefundInvoiceMutation()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const [toPool, setToPool] = useState(true)
  useBackClose({ open, onClose })

  useEffect(() => {
    setPicked(new Set())
    setReason('')
    setToPool(true)
  }, [invoiceNumber])

  if (!open) return null
  const openLines = data?.lines.filter((l) => !l.refunded) ?? []
  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const submit = () =>
    refund.mutate(
      { invoiceNumber, leadIds: [...picked], reason: reason.trim(), returnToPool: toPool },
      {
        onSuccess: (r) => {
          toast.success(`Refunded ₹${(r.amount_cents / 100).toFixed(2)} · credit note ${r.credit_note_number}`)
          onClose()
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Refund failed'),
      },
    )

  return (
    <div
      className="keyboard-safe-modal fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Refund ${invoiceNumber}`}
    >
      <div
        className="keyboard-safe-sheet surface-elevated w-full max-w-md rounded p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">Refund leads · {invoiceNumber}</h2>
        <p className="mt-1 text-ds-caption text-muted-foreground">
          The member gets the money back in their wallet and a credit note is issued against this invoice.
        </p>

        {isPending ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : isError || !data ? (
          <p className="mt-3 text-ds-caption text-destructive-ink">Could not load this invoice.</p>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between text-ds-caption text-muted-foreground">
              <span>
                {openLines.length} of {data.lines.length} leads can be refunded
              </span>
              {openLines.length > 1 ? (
                <button
                  type="button"
                  className="font-semibold text-primary"
                  onClick={() =>
                    setPicked(picked.size === openLines.length ? new Set() : new Set(openLines.map((l) => l.lead_id)))
                  }
                >
                  {picked.size === openLines.length ? 'Clear' : 'Select all'}
                </button>
              ) : null}
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">
              {data.lines.map((l) => (
                <li key={l.lead_id}>
                  <label className="flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={l.refunded}
                      checked={l.refunded || picked.has(l.lead_id)}
                      onChange={() => toggle(l.lead_id)}
                    />
                    <span className={l.refunded ? 'text-muted-foreground line-through' : 'text-foreground'}>
                      {l.lead_ref}
                    </span>
                    {l.refunded ? <span className="ml-auto text-ds-caption text-muted-foreground">refunded</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            <label className="mt-3 block">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Reason (printed on the credit note)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wrong number / duplicate lead"
                className="field-input w-full"
                maxLength={300}
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-ds-caption text-foreground">
              <input type="checkbox" checked={toPool} onChange={(e) => setToPool(e.target.checked)} />
              Put these leads back in the pool
            </label>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={picked.size === 0 || reason.trim().length < 3 || refund.isPending}
            onClick={submit}
          >
            {refund.isPending ? 'Refunding…' : `Refund ${picked.size || ''} lead${picked.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
