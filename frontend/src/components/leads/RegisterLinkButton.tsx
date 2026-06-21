import { useState } from 'react'
import { Check, UserPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { type LeadPublic, useLeadRegisterLinkMutation } from '@/hooks/use-leads-query'

/**
 * Shown on a closed (converted) lead. The register link auto-fires the moment a
 * lead is closed; this lets the closer copy / re-send it for leads closed before
 * the feature existed (or to re-share), and shows a "Registered" pill once the
 * prospect has joined. Used on both the Calling Board card and the Workboard card.
 */
export function RegisterLinkButton({ lead, className }: { lead: LeadPublic; className?: string }) {
  const mut = useLeadRegisterLinkMutation()
  const [done, setDone] = useState(false)

  if (lead.registered_at) {
    return (
      <span
        className={cn(
          'flex h-8 items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 text-ds-caption font-semibold text-emerald-600 dark:text-emerald-300',
          className,
        )}
        title="This lead has registered as a member"
      >
        <Check className="size-3.5" aria-hidden /> Registered
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={mut.isPending}
      onClick={async () => {
        try {
          const r = await mut.mutateAsync({ id: lead.id, resend: true })
          if (r.register_url) {
            try {
              await navigator.clipboard.writeText(r.register_url)
            } catch {
              /* clipboard blocked — manual share still opens */
            }
          }
          if (r.manual_share_url) window.open(r.manual_share_url, '_blank', 'noopener')
          setDone(true)
          window.setTimeout(() => setDone(false), 2000)
        } catch {
          /* surfaced by the disabled→enabled state; no-op */
        }
      }}
      className={cn(
        'flex h-8 items-center gap-1 rounded-full border px-2.5 text-ds-caption font-semibold transition active:scale-95 disabled:opacity-50',
        done
          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
          : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
        className,
      )}
      title="Copy & re-send the register link on WhatsApp"
      aria-label="Send register link"
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
      {done ? 'Sent' : 'Register link'}
    </button>
  )
}
