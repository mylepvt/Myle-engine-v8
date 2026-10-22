import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmpty } from '@/components/ui/states'
import { FreeRechargeStatus } from '@/components/wallet/FreeRechargeRequestCard'
import {
  useFreeRechargeRequestsQuery,
  useReviewFreeRechargeMutation,
  type FreeRecharge,
} from '@/hooks/use-wallet-recharge-query'
import { playAppSound } from '@/lib/app-sounds'
import { cn } from '@/lib/utils'

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function Row({ item, review }: { item: FreeRecharge; review: ReturnType<typeof useReviewFreeRechargeMutation> }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function decide(status: 'approved' | 'rejected') {
    setError('')
    try {
      await review.mutateAsync({ id: item.id, body: { status, admin_note: note.trim() || undefined } })
      playAppSound(status === 'approved' ? 'claim' : 'error')
      setRejecting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  const member = item.member_name?.trim() || `User #${item.user_id}`
  const forSelf = item.user_id === item.requested_by_user_id

  return (
    <li className="surface-elevated space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums text-foreground">{inr.format(item.amount_cents / 100)}</span>
            <FreeRechargeStatus status={item.status} />
          </div>
          <p className="text-foreground">
            For {member}
            {item.member_fbo_id ? <span className="text-muted-foreground"> · {item.member_fbo_id}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {forSelf ? 'Leader asked for themselves' : `Asked by leader ${item.requested_by_name ?? `#${item.requested_by_user_id}`}`}
            {' · '}
            {new Date(item.created_at).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-muted-foreground">Reason: {item.reason}</p>
          {item.reviewed_at ? (
            <p className="text-xs text-muted-foreground">
              Reviewed {new Date(item.reviewed_at).toLocaleString('en-IN')}
              {item.reviewed_by_name ? ` by ${item.reviewed_by_name}` : ''}
            </p>
          ) : null}
          {item.admin_note ? <p className="text-xs text-muted-foreground">Note: {item.admin_note}</p> : null}
        </div>
        {item.status === 'pending' ? (
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" disabled={review.isPending} onClick={() => void decide('approved')}>
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={review.isPending}
              onClick={() => setRejecting((v) => !v)}
              className="text-destructive hover:text-destructive"
            >
              Reject
            </Button>
          </div>
        ) : null}
      </div>
      {rejecting ? (
        <div className="surface-inset space-y-2 p-3">
          <input
            aria-label="Rejection note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional, the leader sees it)"
            className="w-full input-base px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={review.isPending}
              className="text-destructive hover:text-destructive"
              onClick={() => void decide('rejected')}
            >
              {review.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/** Admin: leaders' free recharge requests. Approving adds the money to the member's wallet as free credit. */
export function FreeRechargeAdminList() {
  const q = useFreeRechargeRequestsQuery()
  const review = useReviewFreeRechargeMutation()
  const [tab, setTab] = useState<FilterTab>('pending')
  const all = q.data?.items ?? []
  const shown = tab === 'all' ? all : all.filter((r) => r.status === tab)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Leaders ask for free money for themselves or their own team. Approve to add it to the member’s wallet as
        free credit (Myle Ledger books it apart from paid recharges).
      </p>
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((t) => {
          const n = t.value === 'all' ? all.length : all.filter((r) => r.status === t.value).length
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'press rounded-full px-3.5 py-1.5 text-sm font-medium',
                tab === t.value ? 'control-pill' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {n > 0 ? <span className="ml-1.5 tabular-nums opacity-75">({n})</span> : null}
            </button>
          )
        })}
      </div>
      {q.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {q.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {q.error.message}
        </p>
      ) : null}
      {q.data && shown.length === 0 ? <InlineEmpty>No {tab === 'all' ? '' : `${tab} `}free recharge requests.</InlineEmpty> : null}
      {shown.length > 0 ? (
        <ul className="space-y-3">
          {shown.map((item) => (
            <Row key={item.id} item={item} review={review} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
