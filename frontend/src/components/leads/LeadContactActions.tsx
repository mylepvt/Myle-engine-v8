import type { MouseEvent } from 'react'
import { MessageCircle, Phone } from 'lucide-react'

import { telHref, whatsAppChatHref } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

type Props = {
  phone: string | null | undefined
  className?: string
  /** Dense tables vs workboard cards */
  size?: 'sm' | 'md'
  /** Use inside clickable rows/cards so tel/wa clicks don’t toggle selection */
  stopPropagation?: boolean
}

const boxSm =
  'flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] text-foreground transition [&_svg]:h-3.5 [&_svg]:w-3.5'
const boxMd =
  'flex h-8 w-8 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] text-foreground transition [&_svg]:h-4 [&_svg]:w-4'

/**
 * Phone dial + WhatsApp chat — same deep links as legacy (`tel:` / `wa.me`).
 * Hidden when there is no usable phone string.
 */
export function LeadContactActions({
  phone,
  className,
  size = 'sm',
  stopPropagation,
}: Props) {
  if (!phone?.trim()) return null
  const tel = telHref(phone)
  const wa = whatsAppChatHref(phone)
  if (tel === '#' && wa === '#') return null

  const box = size === 'md' ? boxMd : boxSm
  const stop = stopPropagation ? (e: MouseEvent) => e.stopPropagation() : undefined

  return (
    <div
      role="group"
      aria-label="Phone and WhatsApp"
      className={cn('inline-flex items-center gap-1.5', className)}
      onClick={stop}
    >
      {tel !== '#' ? (
        <a
          href={tel}
          title="Phone call"
          className={cn(box, 'hover:border-primary/40 hover:text-primary')}
        >
          <Phone aria-hidden />
          <span className="sr-only">Call</span>
        </a>
      ) : null}
      {wa !== '#' ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          title="WhatsApp — opens WhatsApp or WhatsApp Business on this number"
          className={cn(box, 'hover:border-green-400/40 hover:text-green-400')}
        >
          <MessageCircle aria-hidden />
          <span className="sr-only">WhatsApp</span>
        </a>
      ) : null}
    </div>
  )
}
