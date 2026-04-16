import { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { buildCsv } from '@/lib/csv-string'

type Props = { title: string }

type BudgetRow = {
  member: string
  email: string
  fbo: string
  phone: string
  balance: string
  recharged: string
  adminAdj: string
  leads: string
}

/** Parse the structured detail string from the backend budget-export endpoint.
 * Format: "email · FBO 123 · phone 555 · balance ₹X · recharged ₹X · admin adj ₹X · assigned active leads N"
 */
function parseDetailString(detail: string): Omit<BudgetRow, 'member'> {
  const extract = (prefix: string, fallback = '—'): string => {
    const i = detail.indexOf(prefix)
    if (i === -1) return fallback
    const start = i + prefix.length
    const end = detail.indexOf(' ·', start)
    return (end === -1 ? detail.slice(start) : detail.slice(start, end)).trim() || fallback
  }
  return {
    email: extract(''),
    fbo: extract('FBO '),
    phone: extract('phone '),
    balance: extract('balance '),
    recharged: extract('recharged '),
    adminAdj: extract('admin adj '),
    leads: extract('assigned active leads '),
  }
}

function parseRow(row: Record<string, unknown>): BudgetRow {
  const member = typeof row.title === 'string' ? row.title : '—'
  const detail = typeof row.detail === 'string' ? row.detail : ''
  const parts = detail.split(' · ')
  // first segment is email
  const email = parts[0]?.trim() || '—'
  const fbo = parts[1]?.replace(/^FBO\s*/, '').trim() || '—'
  const phone = parts[2]?.replace(/^phone\s*/, '').trim() || '—'
  const balance = parts[3]?.replace(/^balance\s*/, '').trim() || '—'
  const recharged = parts[4]?.replace(/^recharged\s*/, '').trim() || '—'
  const adminAdj = parts[5]?.replace(/^admin adj\s*/, '').trim() || '—'
  const leads = parts[6]?.replace(/^assigned active leads\s*/, '').trim() || '0'
  return { member, email, fbo, phone, balance, recharged, adminAdj, leads }
}

export function BudgetExportPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/finance/budget-export')

  const tableRows = useMemo<BudgetRow[]>(
    () => (data?.items ?? []).map((row) => parseRow(row)),
    [data],
  )

  const downloadCsv = useCallback(() => {
    const headers = ['Member', 'Email', 'FBO ID', 'Phone', 'Balance', 'Recharged', 'Admin Adj', 'Assigned Leads']
    const csv = buildCsv(
      headers,
      tableRows.map((r) => [r.member, r.email, r.fbo, r.phone, r.balance, r.recharged, r.adminAdj, r.leads]),
    )
    let url: string | undefined
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `budget-member-summary-${new Date().toISOString().slice(0, 10)}.csv`
      a.rel = 'noopener'
      a.click()
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }, [tableRows])

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={tableRows.length === 0}
            onClick={downloadCsv}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isPending}
          >
            {isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        One row per approved member: wallet balance, approved recharges, admin adjustments, and
        active assigned lead count. Download CSV exports all columns.
      </p>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
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
      {data ? (
        <div className="space-y-3">
          {data.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}
          <div className="surface-elevated overflow-x-auto p-4">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Member</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">FBO ID</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium text-right">Balance</th>
                  <th className="py-2 pr-4 font-medium text-right">Recharged</th>
                  <th className="py-2 pr-4 font-medium text-right">Admin Adj</th>
                  <th className="py-2 font-medium text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.06]">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{r.member}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{r.email}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{r.fbo}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{r.phone}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">{r.balance}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{r.recharged}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{r.adminAdj}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{r.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableRows.length === 0 ? (
              <p className="mt-3 text-muted-foreground">No approved members to list.</p>
            ) : null}
          </div>
          {tableRows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {tableRows.length} member{tableRows.length !== 1 ? 's' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
