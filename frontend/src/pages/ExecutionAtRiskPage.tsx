import { useQuery } from '@tanstack/react-query'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'

type AtRiskLeadRow = {
  id: number
  name: string
  phone: string | null
  status: string
  updated_at: string | null
  assignee: string | null
  team_member_display: string
  leader_username: string | null
  days_stuck: number
  proof_state: string
}

type Props = { title: string }

export function ExecutionAtRiskPage({ title }: Props) {
  const q = useQuery({
    queryKey: ['execution-at-risk'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/execution/at-risk-leads?limit=500')
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      return res.json() as Promise<AtRiskLeadRow[]>
    },
  })

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Admin-only working set — leads with older activity than the stale window (see API). Use Leads / Workboard to
        act on rows.
      </p>

      {q.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : null}
      {q.isError ? (
        <p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : 'Failed'}</p>
      ) : null}

      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No at-risk rows for current filters.</p>
      ) : null}

      {q.data && q.data.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-ds-caption uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Days stuck</th>
                <th className="px-3 py-2">Proof</th>
                <th className="px-3 py-2">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.06]">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{r.name}</span>
                    {r.phone ? (
                      <span className="ml-2 text-ds-caption text-muted-foreground">{r.phone}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{r.status}</td>
                  <td className="px-3 py-2 tabular-nums text-foreground">{r.days_stuck.toFixed(1)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.proof_state}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.team_member_display || r.assignee || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
