import { FileDown } from 'lucide-react'

import { invoiceDownloadUrl } from '@/lib/invoice-url'
import { cn } from '@/lib/utils'

export type InvoiceDownloadKind = 'receipt' | 'tax_invoice' | 'ledger'

type Props = {
  invoiceNumber: string
  /** receipt = payment receipt; tax_invoice = GST invoice; ledger = infer from amount sign */
  kind: InvoiceDownloadKind
  /** Required when kind is `ledger`: positive line → receipt, negative → tax invoice */
  amountCents?: number
  className?: string
}

function resolveLabel(kind: InvoiceDownloadKind, amountCents?: number): string {
  if (kind === 'receipt') return 'Download payment receipt'
  if (kind === 'tax_invoice') return 'Download tax invoice'
  const cents = amountCents ?? 0
  return cents >= 0 ? 'Download payment receipt' : 'Download tax invoice'
}

export function InvoiceDownloadLink({ invoiceNumber, kind, amountCents, className }: Props) {
  const label = resolveLabel(kind, amountCents)
  return (
    <a
      href={invoiceDownloadUrl(invoiceNumber)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-lg border border-white/12 bg-muted/60 px-2.5 py-1.5 text-left text-xs font-medium text-primary shadow-glass-inset transition-colors hover:border-primary/40 hover:bg-primary/10',
        className,
      )}
      title={`${label} — opens in a new tab; use browser Print → Save as PDF if needed.`}
      aria-label={`${label} (${invoiceNumber})`}
    >
      <FileDown className="size-3.5 shrink-0 opacity-90" aria-hidden />
      <span className="min-w-0 leading-snug">{label}</span>
    </a>
  )
}
