import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { InlineEmpty } from '@/components/ui/states'

type ExitedMemberBudgetRow = {
  user_id: number
  display_name: string
  fbo_id: string | null
  phone: string | null
  role: string
  exit_status: 'removed' | 'blocked'
  removed_at: string | null
  removal_reason: string | null
  removed_by_name: string | null
  upline_name: string | null
  balance_cents: number
  total_credited_cents: number
  total_debited_cents: number
  last_wallet_activity_at: string | null
}

type ExitedMemberBudgetResponse = {
  total_members: number
  total_unused_cents: number
  total_negative_cents: number
  items: ExitedMemberBudgetRow[]
}

const inr = (cents: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(cents / 100)

const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

async function fetchExitedMembersBudget(): Promise<ExitedMemberBudgetResponse> {
  const res = await apiFetch('/api/v1/finance/budget-export/exited-members')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(body, `HTTP ${res.status}`))
  return body as ExitedMemberBudgetResponse
}

/** Admin: wallet money still left with members who were removed / blocked from the app. */
export function ExitedMembersBudgetCard() {
  const q = useQuery({
    queryKey: ['finance', 'budget-export', 'exited-members'],
    queryFn: fetchExitedMembersBudget,
    staleTime: 60_000,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Removed / blocked members — unused budget</CardTitle>
        <CardDescription>
          Wallet balance still left with members who were removed or blocked. They are not in the lists above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {q.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {q.error instanceof Error ? q.error.message : 'Could not load removed members budget.'}
          </p>
        ) : null}

        {q.data ? (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Unused budget: </span>
                <strong className="tabular-nums text-foreground">{inr(q.data.total_unused_cents)}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Members: </span>
                <strong className="tabular-nums text-foreground">{q.data.total_members}</strong>
              </p>
              {q.data.total_negative_cents < 0 ? (
                <p>
                  <span className="text-muted-foreground">Overspent: </span>
                  <strong className="tabular-nums text-destructive">{inr(q.data.total_negative_cents)}</strong>
                </p>
              ) : null}
            </div>

            {q.data.items.length === 0 ? (
              <InlineEmpty>No removed or blocked member has money left in their wallet.</InlineEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Person</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Leader</th>
                      <th className="py-2 pr-4 font-medium text-right">Unused budget</th>
                      <th className="py-2 pr-4 font-medium text-right">Total recharged</th>
                      <th className="py-2 pr-4 font-medium text-right">Total spent</th>
                      <th className="py-2 font-medium">Last wallet activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.items.map((row) => (
                      <tr key={row.user_id} className="border-b border-border/50 align-top">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-foreground">{row.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.fbo_id, row.phone, row.role].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          <p className={row.exit_status === 'removed' ? 'text-destructive' : 'text-warning-ink'}>
                            {row.exit_status === 'removed' ? 'Removed' : 'Blocked'}
                            {row.removed_at ? ` · ${shortDate(row.removed_at)}` : ''}
                          </p>
                          {row.removal_reason ? (
                            <p className="text-xs text-muted-foreground">{row.removal_reason}</p>
                          ) : null}
                          {row.removed_by_name ? (
                            <p className="text-xs text-muted-foreground">By {row.removed_by_name}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{row.upline_name ?? '—'}</td>
                        <td
                          className={`py-3 pr-4 text-right font-semibold tabular-nums ${row.balance_cents < 0 ? 'text-destructive' : 'text-foreground'}`}
                        >
                          {inr(row.balance_cents)}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                          {inr(row.total_credited_cents)}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                          {inr(row.total_debited_cents)}
                        </td>
                        <td className="py-3 text-muted-foreground">{shortDate(row.last_wallet_activity_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
