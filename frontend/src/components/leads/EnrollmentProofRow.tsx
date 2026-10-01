import { useState } from 'react'
import { Image as ImageIcon, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { type LeadPublic, useSendBackFromDay1Mutation } from '@/hooks/use-leads-query'

/** Leader's Day 1 card: the member's enrollment screenshot + "Send back" if it looks wrong. */
export function EnrollmentProofRow({ lead, canSendBack }: { lead: LeadPublic; canSendBack: boolean }) {
  const mut = useSendBackFromDay1Mutation()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  if (!lead.enrollment_proof_url) return null
  const rupees = lead.enrollment_amount_cents != null ? Math.round(lead.enrollment_amount_cents / 100) : null

  return (
    <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-2 text-ds-caption">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">Enrollment{rupees != null ? ` ₹${rupees}` : ''}</span>
        <a
          href={lead.enrollment_proof_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          <ImageIcon className="size-3.5" aria-hidden /> View screenshot
        </a>
        {canSendBack && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex items-center gap-1 text-destructive hover:underline"
          >
            <Undo2 className="size-3.5" aria-hidden /> Send back
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional), e.g. amount not visible"
            maxLength={300}
            className="field-input"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={mut.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={mut.isPending}
              onClick={() => mut.mutate({ leadId: lead.id, reason }, { onSuccess: () => setConfirming(false) })}
            >
              {mut.isPending ? 'Sending back…' : 'Send back to member'}
            </Button>
          </div>
          {mut.error ? <p className="text-destructive">{mut.error.message}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
