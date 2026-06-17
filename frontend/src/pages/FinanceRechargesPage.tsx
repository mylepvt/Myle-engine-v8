import { useDeferredValue, useState } from 'react'

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

function formatInr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function FinanceRechargesPage({ title }: Props) {
  const stub = useShellStubQuery('/api/v1/finance/recharges')
  const members = useTeamMembersQuery(true)
  const mut = useWalletAdjustmentMutation()
  const [userId, setUserId] = useState('')
  const [amountCents, setAmountCents] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [note, setNote] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
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
  const parsedCents = Number(amountCents)
  const inrDisplay = Number.isFinite(parsedCents) && parsedCents !== 0
    ? formatInr(Math.abs(parsedCents))
    : null

  async function onSubmit() {
    setShowConfirm(false)
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
    <div className="max-w-2xl space-y-4 md:space-y-6">
      <h1 className="text-ds-h2">{title}</h1>

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

        <form onSubmit={(e) => { e.preventDefault(); setShowConfirm(true) }} className="surface-elevated space-y-4 p-4">
          <p className="text-sm font-medium text-foreground">Credit / debit user wallet</p>
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
                className="w-full rounded-md border border-border dark:border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50"
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
            Amount in <strong>paise (cents)</strong>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="recharge-cents"
              type="number"
              value={amountCents}
              onChange={(e) => setAmountCents(e.target.value)}
              required
              disabled={mut.isPending}
              className="w-full rounded-md border border-border dark:border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground disabled:opacity-50"
            />
            {inrDisplay ? (
              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                ≈ {parsedCents > 0 ? '+' : ''}{inrDisplay}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Negative values = debit. Example: 10000 = {formatInr(10000)} credit, -5000 = {formatInr(5000)} debit.
          </p>
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
            className="w-full rounded-md border border-border dark:border-white/12 bg-muted/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground disabled:opacity-50"
          />
        </div>
        <Button type="submit" disabled={mut.isPending || !userId || !amountCents}>
          {mut.isPending ? 'Applying…' : 'Review & confirm'}
        </Button>
        {mut.isError ? (
          <p className="text-xs text-destructive" role="alert">
            {mut.error instanceof Error ? mut.error.message : 'Request failed'}
          </p>
        ) : null}
        {mut.isSuccess ? <p className="text-xs text-emerald-500">Ledger line recorded.</p> : null}
      </form>

      {showConfirm && selectedMember ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowConfirm(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm wallet adjustment"
        >
          <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground">Confirm wallet adjustment</h3>
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="text-muted-foreground">User:</span> {memberSelectLabel(selectedMember)}</p>
              <p><span className="text-muted-foreground">Amount:</span> <strong className={parsedCents >= 0 ? 'text-emerald-500' : 'text-destructive'}>{parsedCents >= 0 ? '+' : ''}{formatInr(Math.abs(parsedCents))}</strong></p>
              {note.trim() ? <p><span className="text-muted-foreground">Note:</span> {note.trim()}</p> : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">This action cannot be undone. Review carefully before confirming.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={mut.isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {mut.isPending ? 'Applying…' : 'Confirm adjustment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
