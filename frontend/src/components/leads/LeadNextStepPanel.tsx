import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  pickPrimaryNextTransition,
  primaryActionLabel,
  buildWhatsAppVideoUrl,
  shouldOfferWhatsAppForTransition,
} from '@/lib/lead-next-action'
import { iosNoVibrateAudioFallback } from '@/lib/haptic-audio-fallback'
import { hapticCoin, hapticError, hapticTapHeavy } from '@/lib/haptics'
import { playUiErrorSound, playUiPaymentCashSound, playUiTickSound, unlockUiAudioFromUserGesture } from '@/lib/ui-sounds'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'
import { useAvailableTransitionsQuery, useTransitionLeadMutation } from '@/hooks/use-pipeline-query'
import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'

type LeadMini = {
  id: number
  name: string
  phone?: string | null
  status: string
}

type Props = {
  lead: LeadMini
  className?: string
}

export function LeadNextStepPanel({ lead, className }: Props) {
  const { data: transitions, isPending, isError, error, refetch } = useAvailableTransitionsQuery(lead.id)
  const mut = useTransitionLeadMutation()
  const [showAll, setShowAll] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const primary = transitions?.length
    ? pickPrimaryNextTransition(lead.status, transitions)
    : null

  const others =
    transitions && primary ? transitions.filter((t) => t !== primary) : transitions ?? []

  async function runTransition(target: string) {
    setLocalError(null)
    await unlockUiAudioFromUserGesture()
    hapticTapHeavy()
    try {
      const res = await mut.mutateAsync({ leadId: lead.id, targetStatus: target })
      if (res.new_status === 'converted') {
        const { soundEnabled, hapticsEnabled } = useUiFeedbackStore.getState()
        if (soundEnabled) void playUiPaymentCashSound()
        if (hapticsEnabled) hapticCoin()
        await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
      }
    } catch (e) {
      void playUiErrorSound()
      hapticError()
      setLocalError(e instanceof Error ? e.message : 'Could not update stage')
    }
  }

  async function onPrimaryClick() {
    if (!primary) return
    if (shouldOfferWhatsAppForTransition(lead.status, primary)) {
      const url = buildWhatsAppVideoUrl(lead.phone, lead.name)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    }
    await runTransition(primary)
  }

  if (isPending) {
    return (
      <div className={cn('rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-muted-foreground', className)}>
        Loading next step…
      </div>
    )
  }

  if (isError) {
    return (
      <div className={cn('rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive', className)} role="alert">
        {error instanceof Error ? error.message : 'Could not load transitions'}{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    )
  }

  if (!transitions?.length || !primary) {
    return (
      <div className={cn('rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-muted-foreground', className)}>
        No pipeline move available for your role from this stage (or lead is terminal). Use full status controls if your
        role allows.
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
      <Button
        type="button"
        className="h-11 w-full justify-center gap-2 rounded-xl border border-primary/35 bg-primary/15 text-sm font-semibold text-primary shadow-sm transition-transform active:scale-[0.98] hover:bg-primary/25"
        disabled={mut.isPending}
        onClick={() => void onPrimaryClick()}
      >
        {shouldOfferWhatsAppForTransition(lead.status, primary) ? (
          <MessageCircle className="size-4 shrink-0" aria-hidden />
        ) : null}
        {primaryActionLabel(primary)}
      </Button>

      {localError ? (
        <p className="text-xs text-destructive" role="alert">
          {localError}
        </p>
      ) : null}

      {others.length > 0 ? (
        <div className="pt-1">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showAll ? 'Hide other steps' : `Other steps (${others.length})`}
          </button>
          {showAll ? (
            <div className="mt-2 flex flex-col gap-1">
              {others.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-xs"
                  disabled={mut.isPending}
                  onClick={() => void runTransition(t)}
                >
                  {LEAD_STATUS_OPTIONS.find((o) => o.value === t)?.label ?? t}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
