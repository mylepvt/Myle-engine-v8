import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'

type Props = { title: string }

export function SettingsAppPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/app')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const items = data?.items ?? []
    const mapped = items
      .map((row) => ({
        key: typeof row.key === 'string' ? row.key : '',
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row),
      }))
      .filter((r) => r.key || r.value)
    const needle = q.trim().toLowerCase()
    if (!needle) return mapped
    return mapped.filter(
      (r) => r.key.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle),
    )
  }, [data, q])

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All rows from <code className="rounded bg-white/10 px-1 text-xs">app_settings</code>. Sensitive
        secrets should stay in server environment variables — this table is for product toggles and
        copy (e.g. live session text).
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
          <label className="block max-w-md text-sm">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Filter keys / values</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <div className="surface-elevated max-h-[min(32rem,70vh)] overflow-auto p-3">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/40 backdrop-blur-sm">
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Key</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key ? `${r.key}:${idx}` : `row-${idx}`} className="border-b border-white/[0.06] align-top">
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-primary">{r.key}</td>
                    <td className="py-2 break-all text-muted-foreground">{r.value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <p className="p-3 text-muted-foreground">No matching rows.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
