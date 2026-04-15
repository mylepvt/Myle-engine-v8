import { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { buildCsv } from '@/lib/csv-string'

type Props = { title: string }

export function BudgetExportPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/finance/budget-export')

  const tableRows = useMemo(
    () =>
      (data?.items ?? []).map((row) => ({
        month: typeof row.title === 'string' ? row.title : '—',
        detail: typeof row.detail === 'string' ? row.detail : '',
      })),
    [data],
  )

  const downloadCsv = useCallback(() => {
    const csv = buildCsv(
      ['Month', 'Summary'],
      tableRows.map((r) => [r.month, r.detail]),
    )
    let url: string | undefined
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `budget-ledger-by-month-${new Date().toISOString().slice(0, 10)}.csv`
      a.rel = 'noopener'
      a.click()
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }, [tableRows])

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Net wallet ledger movement grouped by calendar month (UTC bucket). Use CSV for finance
        reconciliation.
      </p>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
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
        <div className="space-y-4">
          {data.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={tableRows.length === 0} onClick={downloadCsv}>
              Download CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Refresh
            </Button>
          </div>
          <div className="surface-elevated overflow-x-auto p-4">
            <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Month</th>
                  <th className="py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.06]">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{r.month}</td>
                    <td className="py-2.5 text-muted-foreground">{r.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableRows.length === 0 ? (
              <p className="mt-3 text-muted-foreground">No ledger rows in range.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
