import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { EmptyStatePremium } from '@/components/ui/empty-state-premium'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS,
  type LeadStatus,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useRetargetQuery } from '@/hooks/use-retarget-query'

type Props = {
  title: string
}

function statusLabel(v: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
}

export function RetargetWorkPage({ title }: Props) {
  const [qInput, setQInput] = useState('')
  const { data, isPending, isError, error, refetch } = useRetargetQuery()
  const patchMut = usePatchLeadMutation()

  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    const q = qInput.trim().toLowerCase()
    if (!q) return data.items
    return data.items.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q),
    )
  }, [data, qInput])

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="min-w-0 max-w-full truncate text-ds-h2">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">
        Shows active leads in <strong>Lost</strong>, <strong>Inactive</strong>, <strong>Retarget</strong>, or <strong>Contacted</strong> states.
        Change status from{' '}
        <Link to="/dashboard/work/leads" className="text-primary underline-offset-2 hover:underline">
          Calling Board
        </Link>{' '}
        or here.
      </p>

      <div className="surface-inset flex h-9 items-center gap-1.5 rounded-lg px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search name, phone..."
          aria-label="Search retarget leads"
          className="min-w-0 flex-1 bg-transparent text-ds-caption text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <div className="surface-elevated p-4 text-sm">
          <p className="mb-3 font-medium text-foreground">Total: {qInput.trim() ? filteredItems.length : data.total}</p>
          {filteredItems.length === 0 ? (
            <EmptyStatePremium
              variant="search"
              title="No retarget candidates"
              description="Move a lead to Lost or Contacted first, then it will appear here."
              icon={RefreshCw}
            />
          ) : (
            <ul className="space-y-2">
              {filteredItems.map((l) => (
                <li
                  key={l.id}
                  className="surface-inset flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{l.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      #{l.id} · {statusLabel(l.status)}
                      {l.phone?.trim() ? ` · ${l.phone}` : ''}
                    </span>
                  </div>
                  <LeadContactActions phone={l.phone} className="shrink-0" />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Status for ${l.name}`}
                      data-ui-silent
                      value={l.status}
                      disabled={patchMut.isPending}
                      onChange={(e) => {
                        void patchMut.mutateAsync({
                          id: l.id,
                          body: { status: e.target.value as LeadStatus },
                        })
                      }}
                      className="rounded-md border border-border dark:border-white/12 bg-muted/50 backdrop-blur-sm px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                    >
                      {LEAD_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {patchMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
