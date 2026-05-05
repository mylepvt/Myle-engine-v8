import { type FormEvent, useDeferredValue, useState } from 'react'

import { InsightList } from '@/components/dashboard/InsightList'
import { Button } from '@/components/ui/button'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { useTeamMembersQuery, type TeamMemberPublic } from '@/hooks/use-team-query'
import { directorySearchValues, filterCollectionByQuery } from '@/lib/search-filter'
import { useWalletAdjustmentMutation } from '@/hooks/use-wallet-query'

type Props = { title: string }

function memberSelectLabel(m: TeamMemberPublic): string {
  const display = (m.name && m.name.trim()) || m.username || m.email
  return `${display} · ${m.fbo_id} (${m.role})`
}

export function FinanceRechargesPage({ title }: Props) {
  const stub = useShellStubQuery('/api/v1/finance/recharges')
  const members = useTeamMembersQuery(true)
  const mut = useWalletAdjustmentMutation()
  const [userId, setUserId] = useState('')
  const [amountCents, setAmountCents] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [note, setNote] = useState('')
  const deferredMemberQuery = useDeferredValue(memberQuery)
  const searchActive = memberQuery.trim().length > 0
  const filteredMembers = members.data
    ? filterCollectionByQuery(members.data.items, deferredMemberQuery, (member) => directorySearchValues(member))
    : []
  const selectedMember = members.data?.items.find((member) => String(member.id) === userId) ?? null
  const visibleMembers =
    selectedMember && !filteredMembers.some((member) => member.id === selectedMember.id)
      ? [selectedMember, ...filteredMembers]
      : filteredMembers

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const uid = Number(userId)
    const cents = Number(amountCents)
    if (!Number.isFinite(uid) || uid < 1 || !Number.isFinite(cents)) return
    const idempotency_key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `recharge-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      await mut.mutateAsync({
        user_id: uid,
        amount_cents: Math.trunc(cents),
        idempotency_key,
        note: note.trim() || undefined,
      })
      setAmountCents('')
      setNote('')
    } catch {
      /* surfaced below */
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>

      {stub.isPending ? <Skeleton className="h-12 w-full" /> : null}
      {stub.data?.note ? (
        <p className="surface-elevated p-3 text-sm text-muted-foreground">
          {stub.data.note}
        </p>
      ) : null}
      {stub.data && stub.data.items.length > 0 ? (
        <div className="surface-elevated p-3">
          <p className="mb-2 text-ds-caption text-muted-foreground">Recent ledger lines</p>
          <InsightList items={stub.data.items} />
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="surface-elevated space-y-4 p-4">
        <p className="text-sm font-medium text-foreground">Credit / debit user wallet</p>
        <p className="text-xs text-muted-foreground">
          Amount in <strong>minor units (paise / cents)</strong> (e.g. 10000 = INR 100.00 credit). Negative values debit.
        </p>
        {members.isPending ? <Skeleton className="h-10 w-full" /> : null}
        {members.data ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="recharge-member-search" className="mb-1 block text-xs text-muted-foreground">
                Search member
              </label>
              <ListSearchInput
                id="recharge-member-search"
                value={memberQuery}
                onValueChange={setMemberQuery}
                placeholder="Search by name, email, FBO ID, or role"
                aria-label="Search wallet adjustment members"
                wrapperClassName="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {searchActive
                  ? `Showing ${filteredMembers.length} of ${members.data.total} members.`
                  : 'Filter the member list before selecting a user.'}
              </p>
            </div>

            <div>
              <label htmlFor="recharge-user" className="mb-1 block text-xs text-muted-foreground">
                User
              </label>
              <select
                id="recharge-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                disabled={mut.isPending}
                className="w-full rounded-md border border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50"
              >
                <option value="">Select…</option>
                {visibleMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberSelectLabel(m)}
                  </option>
                ))}
              </select>
              {searchActive && filteredMembers.length === 0 && !selectedMember ? (
                <p className="mt-1 text-xs text-muted-foreground">No members match this search.</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {members.isError ? (
          <p className="text-xs text-destructive" role="alert">
            Could not load members (admin only).
          </p>
        ) : null}
        <div>
          <label htmlFor="recharge-cents" className="mb-1 block text-xs text-muted-foreground">
            Amount (cents)
          </label>
          <input
            id="recharge-cents"
            type="number"
            value={amountCents}
            onChange={(e) => setAmountCents(e.target.value)}
            required
            disabled={mut.isPending}
            className="w-full rounded-md border border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="recharge-note" className="mb-1 block text-xs text-muted-foreground">
            Note (optional)
          </label>
          <input
            id="recharge-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={mut.isPending}
            className="w-full rounded-md border border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </div>
        <Button type="submit" disabled={mut.isPending || !userId}>
          {mut.isPending ? 'Applying…' : 'Apply adjustment'}
        </Button>
        {mut.isError ? (
          <p className="text-xs text-destructive" role="alert">
            {mut.error instanceof Error ? mut.error.message : 'Request failed'}
          </p>
        ) : null}
        {mut.isSuccess ? <p className="text-xs text-emerald-500">Ledger line recorded.</p> : null}
      </form>
    </div>
  )
}
