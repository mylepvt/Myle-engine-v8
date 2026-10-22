import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmpty } from '@/components/ui/states'
import { MemberPicker, type PickableMember } from '@/components/team/MemberPicker'
import { useMyTeamQuery } from '@/hooks/use-my-team-query'
import {
  useCreateFreeRechargeMutation,
  useFreeRechargeRequestsQuery,
  type FreeRecharge,
} from '@/hooks/use-wallet-recharge-query'
import { cn } from '@/lib/utils'

const REASONS = ['New joiner', 'Off-record deal', 'Reward for work'] as const

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-warning/15 text-warning-ink',
  approved: 'bg-success/15 text-success-ink',
  rejected: 'bg-destructive/15 text-destructive',
}

export function FreeRechargeStatus({ status }: { status: string }) {
  const label = status === 'pending' ? 'Waiting for admin' : status === 'approved' ? 'Approved' : 'Rejected'
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[status] ?? 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  )
}

function memberLabel(r: FreeRecharge): string {
  const name = r.member_name?.trim() || `User #${r.user_id}`
  return r.member_fbo_id ? `${name} · ${r.member_fbo_id}` : name
}

/** Leader: ask admin to add free (promo) money to their own or a team member's wallet. */
export function FreeRechargeRequestCard({ initialMemberId }: { initialMemberId?: string }) {
  const team = useMyTeamQuery()
  const requests = useFreeRechargeRequestsQuery()
  const create = useCreateFreeRechargeMutation()
  const [userId, setUserId] = useState(initialMemberId ?? '')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const people: PickableMember[] = useMemo(() => {
    const d = team.data
    if (!d) return []
    const rows = [...(d.me ? [{ ...d.me, name: `${d.me.name} (you)` }] : []), ...d.members]
    return rows
      .filter((m) => m.state !== 'removed')
      .map((m) => ({
        id: m.user_id,
        name: m.name,
        fbo_id: m.fbo_id,
        detail: `Wallet ${inr.format(m.wallet_cents / 100)}${m.upline_name && !m.is_direct ? ` · under ${m.upline_name}` : ''}`,
        search: [m.phone, m.upline_name],
      }))
  }, [team.data])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setDone('')
    const rupees = Number(amount)
    if (!userId) return setError('Pick who should get the money.')
    if (!Number.isFinite(rupees) || rupees < 1) return setError('Enter an amount of ₹1 or more.')
    if (rupees > 100000) return setError('Up to ₹1,00,000 per request.')
    if (reason.trim().length < 2) return setError('Tell admin why (e.g. New joiner).')
    try {
      const row = await create.mutateAsync({
        user_id: Number(userId),
        amount_cents: Math.round(rupees * 100),
        reason: reason.trim(),
        idempotency_key:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `free-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
      setDone(`Sent to admin: ${inr.format(row.amount_cents / 100)} for ${row.member_name ?? 'member'}.`)
      setAmount('')
      setReason('')
      setUserId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request')
    }
  }

  const mine = requests.data?.items ?? []

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void submit(e)} className="surface-elevated space-y-4 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Ask for a free recharge</p>
          <p className="text-xs text-muted-foreground">
            For you or someone in your team. No payment needed — admin approves or rejects it. Approved money
            shows in their wallet as free credit.
          </p>
        </div>

        <MemberPicker
          members={people}
          value={userId}
          onChange={setUserId}
          loading={team.isPending}
          disabled={create.isPending}
          label="Who gets it"
        />
        {team.isError ? (
          <p className="text-xs text-destructive" role="alert">
            Could not load your team.
          </p>
        ) : null}

        <div>
          <label htmlFor="free-amount" className="mb-1 block text-xs text-muted-foreground">
            Amount (₹)
          </label>
          <input
            id="free-amount"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 500"
            disabled={create.isPending}
            className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="free-reason" className="block text-xs text-muted-foreground">
            Why
          </label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                disabled={create.isPending}
                className={cn(
                  'press rounded-full px-3 py-1.5 text-sm font-medium',
                  reason === r ? 'control-pill' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            id="free-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Or write your own reason"
            disabled={create.isPending}
            className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-xs text-success-ink" role="status">
            {done}
          </p>
        ) : null}

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Sending…' : 'Send to admin'}
        </Button>
      </form>

      <div className="surface-elevated space-y-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Free recharge requests</p>
        {requests.isPending ? <Skeleton className="h-10 w-full" /> : null}
        {requests.data && mine.length === 0 ? <InlineEmpty>No free recharge requests yet.</InlineEmpty> : null}
        {mine.length > 0 ? (
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="surface-inset px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums text-foreground">{inr.format(r.amount_cents / 100)}</span>
                  <span className="flex items-center gap-2">
                    <FreeRechargeStatus status={r.status} />
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-IN')}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  For {memberLabel(r)} · {r.reason}
                </p>
                {r.admin_note ? <p className="mt-0.5 text-xs text-muted-foreground">Admin: {r.admin_note}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
