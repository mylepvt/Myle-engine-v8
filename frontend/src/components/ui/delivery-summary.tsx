import { CheckCircle2, PhoneOff, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  sent: number
  failed: number
  noPhone: number
  /** Shown when nothing was sent, failed or skipped. */
  emptyText?: string
  className?: string
}

/** Result of a bulk WhatsApp send: sent · failed · skipped for missing phone. */
export function DeliverySummary({ sent, failed, noPhone, emptyText, className }: Props) {
  const nothing = sent === 0 && failed === 0 && noPhone === 0
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-micro font-semibold', className)}>
      {nothing && emptyText ? (
        <span className="font-normal text-muted-foreground">{emptyText}</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" aria-hidden /> {sent} sent
          </span>
          {failed > 0 ? (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <XCircle className="size-3.5" aria-hidden /> {failed} failed
            </span>
          ) : null}
          {noPhone > 0 ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <PhoneOff className="size-3.5" aria-hidden /> {noPhone} no phone
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}
