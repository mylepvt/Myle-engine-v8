import { useState } from 'react'
import { Link } from 'react-router-dom'

import { LiveSessionSlotPicker } from '@/components/leads/LiveSessionSlotPicker'
import { Button } from '@/components/ui/button'
import {
  pickPrimaryNextTransition,
  primaryActionLabel,
  visibleAlternativeTransitions,
} from '@/lib/lead-next-action'
import { useAvailableTransitionsQuery, useTransitionLeadMutation } from '@/hooks/use-leads-query'
import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { useSendEnrollmentVideoMutation } from '@/hooks/use-enroll-query'
import {
  openExternalShareUrl,
} from '@/lib/external-share-window'

type LeadMini = {
  id: number
  name: string
  phone?: string | null
  status: string
  paymentStatus?: string | null
}

type Props = {
  lead: LeadMini
  className?: string
}

export function LeadNextStepPanel({ lead, className }: Props) {
  const { role } = useDashboardShellRole()
  const { data: transitions, isPending, isError, error, refetch } = useAvailableTransitionsQuery(lead.id)
  const mut = useTransitionLeadMutation()
  const sendMut = useSendEnrollmentVideoMutation()
  const [showAll, setShowAll] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const primary = transitions?.length
    ? pickPrimaryNextTransition(lead.status, transitions)
    : null

  const others =
    transitions && primary ? visibleAlternativeTransitions(lead.status, transitions).filter((t) => t !== primary) : []
  const paidGateBlocked = primary === 'paid' && lead.paymentStatus !== 'approved'
  const workLeadsLabel = role === 'admin' ? 'All Leads' : 'Calling Board'

  function paidGateCopy(): string {
    if (role === 'admin') {
      if (lead.paymentStatus === 'proof_uploaded') {
        return 'FLP invoice review me hai. Approvals se approve hote hi Paid unlock ho jayega.'
      }
      return 'FLP invoice leader ya team work/leads flow se upload hota hai. Approval ke baad hi Paid move sahi chalega.'
    }
    if (lead.paymentStatus === 'proof_uploaded') {
      return 'FLP invoice review me hai. Admin approval ke baad Paid unlock ho jayega.'
    }
    if (lead.paymentStatus === 'rejected') {
      return `FLP invoice reject ho gayi hai. Naya invoice ${workLeadsLabel} se upload karo.`
    }
    return `FLP invoice pehle ${workLeadsLabel} se upload karo. Admin approval ke baad Paid unlock hoga.`
  }

  async function runTransition(target: string) {
    setLocalError(null)
    try {
      await mut.mutateAsync({ leadId: lead.id, targetStatus: target })
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not update stage')
    }
  }

  async function onPrimaryClick() {
    if (!primary) return
    setLocalError(null)
    try {
      if (primary === 'video_sent') {
        setPickerOpen(true)
        return
      }
      await runTransition(primary)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not update stage')
    }
  }

  if (isPending) {
    return (
      <div className={cn('rounded-xl border border-border/60 bg-muted/30 p-3 text-ds-caption text-muted-foreground', className)}>
        Loading next step…
      </div>
    )
  }

  if (isError) {
    return (
      <div className={cn('rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-ds-caption text-destructive', className)} role="alert">
        {error instanceof Error ? error.message : 'Could not load transitions'}{' '}
        <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    )
  }

  if (!transitions?.length || !primary) {
    return (
      <div className={cn('rounded-xl border border-border/60 bg-muted/30 p-3 text-ds-caption text-muted-foreground', className)}>
        No next move available for your role from this stage (or lead is terminal). Use full status controls if your
        role allows.
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-ds-caption font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
      {!paidGateBlocked ? (
        <Button
          type="button"
          className="h-11 w-full justify-center gap-2 rounded-xl border border-primary/35 bg-primary/15 text-sm font-semibold text-primary shadow-sm transition-transform active:scale-[0.98] hover:bg-primary/25"
          disabled={mut.isPending || sendMut.isPending}
          onClick={() => void onPrimaryClick()}
        >
          {primary === 'video_sent' ? (
            <MessageCircle className="size-4 shrink-0" aria-hidden />
          ) : null}
          {primaryActionLabel(primary)}
        </Button>
      ) : null}
      {paidGateBlocked ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-ds-caption text-amber-200">
          <p className="leading-relaxed">{paidGateCopy()}</p>
          {role !== 'admin' ? (
            <Link
              to="/dashboard/work/leads"
              className="mt-2 inline-flex font-semibold text-primary underline-offset-2 hover:underline"
            >
              Open {workLeadsLabel}
            </Link>
          ) : (
            <Link
              to="/dashboard/team/enrollment-approvals"
              className="mt-2 inline-flex font-semibold text-primary underline-offset-2 hover:underline"
            >
              Open Enroll Approvals
            </Link>
          )}
        </div>
      ) : null}

      {localError ? (
        <p className="text-ds-caption text-destructive" role="alert">
          {localError}
        </p>
      ) : null}

      {others.length > 0 ? (
        <div className="pt-1">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 text-ds-caption text-muted-foreground hover:text-foreground"
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
                  className="h-8 justify-start text-ds-caption"
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

      <LiveSessionSlotPicker
        open={pickerOpen}
        busy={sendMut.isPending}
        onClose={() => setPickerOpen(false)}
        onConfirm={(slotKey) => {
          setLocalError(null)
          void sendMut
            .mutateAsync({ lead_id: lead.id, live_session_slot_key: slotKey })
            .then((result) => {
              openExternalShareUrl(result.delivery.manual_share_url?.trim())
              setPickerOpen(false)
            })
            .catch((e) => {
              setLocalError(e instanceof Error ? e.message : 'Could not update stage')
            })
        }}
      />
    </div>
  )
}
