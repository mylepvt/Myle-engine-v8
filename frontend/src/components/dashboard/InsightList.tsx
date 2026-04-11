import { Link } from 'react-router-dom'

/**
 * Renders `SystemStubResponse.items` rows when they carry `title`/`detail`/`href`
 * (decision engine); falls back to JSON for unknown shapes.
 */
export function InsightList({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows yet.</p>
  }
  return (
    <ul className="space-y-3">
      {items.map((row, i) => (
        <li
          key={i}
          className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-sm"
        >
          {typeof row.title === 'string' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{row.title}</p>
                {typeof row.severity === 'string' ? (
                  <span className="rounded border border-border px-1.5 py-0.5 text-ds-caption uppercase text-muted-foreground">
                    {row.severity}
                  </span>
                ) : null}
              </div>
              {typeof row.detail === 'string' ? (
                <p className="mt-1 text-muted-foreground">{row.detail}</p>
              ) : null}
              {typeof row.count === 'number' ? (
                <p className="mt-2 text-ds-caption text-subtle">Count: {row.count}</p>
              ) : null}
              {typeof row.href === 'string' ? (
                <Link
                  to={`/dashboard/${row.href}`}
                  className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Open →
                </Link>
              ) : null}
            </>
          ) : typeof row.type === 'string' && row.type === 'lead_created' ? (
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium text-foreground">
                Lead · {typeof row.name === 'string' ? row.name : '—'}
              </span>
              <span className="text-ds-caption text-muted-foreground">
                {typeof row.at === 'string'
                  ? new Date(row.at).toLocaleString()
                  : ''}
              </span>
            </div>
          ) : typeof row.status === 'string' && typeof row.count === 'number' ? (
            <div className="flex justify-between gap-2">
              <span className="font-medium capitalize text-foreground">{row.status}</span>
              <span className="tabular-nums text-foreground">{row.count}</span>
            </div>
          ) : (
            <pre className="max-h-40 overflow-auto text-xs text-muted-foreground">
              {JSON.stringify(row, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}
