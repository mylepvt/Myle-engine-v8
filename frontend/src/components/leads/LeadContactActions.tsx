import type { MouseEvent } from 'react'
import { useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { telHref, whatsAppChatHref, whatsAppBusinessChatHref } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

type Props = {
  phone: string | null | undefined
  className?: string
  /** Dense tables vs workboard cards */
  size?: 'sm' | 'md'
  /** Use inside clickable rows/cards so tel/wa clicks don't toggle selection */
  stopPropagation?: boolean
}

const boxSm =
  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border dark:border-white/12 bg-muted/50 text-foreground transition [&_svg]:h-3.5 [&_svg]:w-3.5'
const boxMd =
  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border dark:border-white/12 bg-muted/50 text-foreground transition [&_svg]:h-4 [&_svg]:w-4'

const BLOCKED_LEVELS = new Set(['strong_warning', 'final_warning'])

/**
 * Phone dial + WhatsApp chat - same deep links as legacy (`tel:` / `api.whatsapp.com/send`).
 * Hidden when there is no usable phone string.
 * Blocked (with reason tooltip) for users under strong/final compliance warning.
 */
export function LeadContactActions({
  phone,
  className,
  size = 'sm',
  stopPropagation,
}: Props) {
  const { data: me } = useAuthMeQuery()
  const [showWaMenu, setShowWaMenu] = useState(false)

  if (!phone?.trim()) return null
  const tel = telHref(phone)
  const wa = whatsAppChatHref(phone)
  const waBusiness = whatsAppBusinessChatHref(phone)
  if (tel === '#' && wa === '#') return null

  const box = size === 'md' ? boxMd : boxSm
  const stop = stopPropagation ? (e: MouseEvent) => e.stopPropagation() : undefined

  const complianceBlocked =
    me?.authenticated &&
    me.role !== 'admin' &&
    BLOCKED_LEVELS.has(me.compliance_level ?? '')

  const blockedReason =
    me?.compliance_level === 'final_warning'
      ? 'Calls and WhatsApp blocked  -  Final Warning active. Complete today\'s calls and daily report before midnight or you will be removed.'
      : 'Calls and WhatsApp blocked  -  Strong Warning active. You have missed targets for 2 days. Meet today\'s targets to restore access.'

  if (complianceBlocked) {
    return (
      <div
        role="group"
        aria-label="Phone and WhatsApp  -  blocked"
        className={cn('inline-flex items-center gap-1.5', className)}
        onClick={stop}
        title={blockedReason}
      >
        <span
          aria-disabled="true"
          className={cn(box, 'cursor-not-allowed opacity-35')}
        >
          <Phone aria-hidden />
          <span className="sr-only">Call blocked  -  {blockedReason}</span>
        </span>
        <span
          aria-disabled="true"
          className={cn(box, 'cursor-not-allowed opacity-35')}
        >
          <MessageCircle aria-hidden />
          <span className="sr-only">WhatsApp blocked  -  {blockedReason}</span>
        </span>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Phone and WhatsApp"
      className={cn('relative inline-flex items-center gap-1.5', className)}
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
        <div className="relative">
          <button
            onClick={(e) => {
              e.preventDefault()
              setShowWaMenu(!showWaMenu)
            }}
            onBlur={() => setTimeout(() => setShowWaMenu(false), 150)}
            title="WhatsApp - click to choose between personal or business account"
            className={cn(box, 'hover:border-green-400/40 hover:text-green-400')}
          >
            <MessageCircle aria-hidden />
            <span className="sr-only">WhatsApp</span>
          </button>
          {showWaMenu && (
            <div className="absolute top-full right-0 mt-1 z-10 bg-muted border border-border dark:border-white/12 rounded-md overflow-hidden shadow-lg">
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowWaMenu(false)}
                className="block px-3 py-2 text-xs whitespace-nowrap hover:bg-foreground/5 text-foreground"
              >
                Personal WhatsApp
              </a>
              {waBusiness !== '#' && (
                <a
                  href={waBusiness}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowWaMenu(false)}
                  className="block px-3 py-2 text-xs whitespace-nowrap hover:bg-foreground/5 text-foreground border-t border-border dark:border-white/12"
                >
                  WhatsApp Business
                </a>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
