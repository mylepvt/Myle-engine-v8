import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  useEnrollmentDecisionMutation,
  useEnrollmentHistoryQuery,
  useEnrollmentRequestsQuery,
} from '@/hooks/use-team-query'
import { playAppSound } from '@/lib/app-sounds'
import { ClipboardList, ExternalLink } from 'lucide-react'

type Props = { title: string }

export function EnrollmentApprovalsPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const decide = useEnrollmentDecisionMutation()
  const { data, isPending, isError, error, refetch } = useEnrollmentRequestsQuery()
  const [historyDate, setHistoryDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const historyQ = useEnrollmentHistoryQuery(historyDate)
  const isAdmin = me?.authenticated && me.role === 'admin'

  async function handleApprove(leadId: number) {
    await decide.mutateAsync({ leadId, action: 'approve' })
    playAppSound('cashier')
  }

  async function handleReject(leadId: number) {
    const reason = window.prompt('Why are you rejecting this proof?', 'Proof is unclear or incomplete')
    if (reason === null) return
    await decide.mutateAsync({
      leadId,
      action: 'reject',
      reason: reason.trim() || 'Proof is unclear or incomplete',
    })
    playAppSound('decline')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? 'Pending Enroll payment proofs from every leader and team member appear here for approval.'
          : 'Review pending Enroll payment proofs for your downline. Admin approves or rejects them here.'}
      </p>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {decide.isError ? (
        <div className="text-sm text-destructive" role="alert">
          {decide.error instanceof Error ? decide.error.message : 'Could not update request'}
        </div>
      ) : null}

      {data && data.total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] py-14 text-center">
          <ClipboardList className="size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No pending enrollment requests</p>
          <p className="text-xs text-muted-foreground">New requests will appear here for your review.</p>
        </div>
      ) : null}

      {data && data.total > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {data.total} pending request{data.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {data.items.map((row) => {
              const amount =
                typeof row.payment_amount_cents === 'number'
                  ? new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 2,
                    }).format(row.payment_amount_cents / 100)
                  : null
              return (
                <li
                  key={row.lead_id}
                  className="surface-elevated flex flex-col gap-3 rounded-xl border border-white/[0.08] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{row.lead_name}</p>
                      <Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'outline'}>
                        {row.status}
                      </Badge>
                    </div>
                    {amount ? (
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Amount: {amount}
                      </p>
                    ) : null}
                    {row.uploaded_by_username ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Uploaded by: {row.uploaded_by_username}
                      </p>
                    ) : null}
                    {row.payment_proof_uploaded_at ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(row.payment_proof_uploaded_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    ) : null}
                    {row.payment_proof_url ? (
                      <a
                        href={row.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                      >
                        View proof
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                  {isAdmin && row.status === 'pending' ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="default"
                        variant="default"
                        disabled={decide.isPending}
                        className="h-11 min-w-[5.5rem] flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:flex-none"
                        onClick={() => void handleApprove(row.lead_id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="default"
                        variant="outline"
                        disabled={decide.isPending}
                        className="h-11 min-w-[5rem] flex-1 border-destructive/50 font-semibold text-destructive hover:bg-destructive/10 sm:flex-none"
                        onClick={() => void handleReject(row.lead_id)}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Proof History</h2>
            <p className="text-xs text-muted-foreground">
              Calendar-wise approvals and rejections for Enroll payment proofs.
            </p>
          </div>
          <div className="min-w-[11rem]">
            <label htmlFor="proof-history-date" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Date
            </label>
            <input
              id="proof-history-date"
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-full rounded-md border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </div>
        </div>

        {historyQ.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {historyQ.isError ? (
          <div className="text-sm text-destructive" role="alert">
            <span>{historyQ.error instanceof Error ? historyQ.error.message : 'Could not load history'} </span>
            <button type="button" className="underline underline-offset-2" onClick={() => void historyQ.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        {historyQ.data && historyQ.data.total === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-muted-foreground">
            No proof decisions found for {historyDate}.
          </div>
        ) : null}

        {historyQ.data && historyQ.data.total > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {historyQ.data.total} decision{historyQ.data.total === 1 ? '' : 's'} on {historyQ.data.date}
            </p>
            <ul className="space-y-3">
              {historyQ.data.items.map((row) => {
                const amount =
                  typeof row.payment_amount_cents === 'number'
                    ? new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 2,
                      }).format(row.payment_amount_cents / 100)
                    : null
                const badgeVariant =
                  row.review_action === 'approved' ? 'default' : 'destructive'
                return (
                  <li
                    key={`${row.lead_id}-${row.review_action}-${row.reviewed_at}`}
                    className="surface-elevated flex flex-col gap-3 rounded-xl border border-white/[0.08] p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{row.lead_name}</p>
                      <Badge variant={badgeVariant}>{row.review_action}</Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {amount ? <p>Amount: {amount}</p> : null}
                      {row.reviewed_by_username ? <p>Reviewed by: {row.reviewed_by_username}</p> : null}
                      <p>
                        {new Date(row.reviewed_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                      {row.review_note ? <p>Note: {row.review_note}</p> : null}
                    </div>
                    {row.payment_proof_url ? (
                      <a
                        href={row.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                      >
                        View proof
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}
