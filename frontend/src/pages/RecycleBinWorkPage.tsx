import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { EmptyStatePremium } from '@/components/ui/empty-state-premium'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useLeadsQuery,
  usePatchLeadMutation,
  usePermanentDeleteLeadMutation,
  type LeadListFilters,
} from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'

type Props = {
  title: string
}

const emptyFilters: LeadListFilters = { q: '', status: '' }

export function RecycleBinWorkPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useLeadsQuery(true, emptyFilters, 'recycle')
  const { serverRole } = useDashboardShellRole()
  const canPermanentlyDelete = serverRole === 'admin'
  const patchMut = usePatchLeadMutation()
  const permanentDeleteMut = usePermanentDeleteLeadMutation()

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <Link
          to="/dashboard/work/leads"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          ← Active leads
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Soft-deleted leads from your execution scope. Restoring returns the lead to your active list.
      </p>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load recycle bin'} </span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-3 font-medium text-foreground">Deleted: {data.total}</p>
          {data.items.length === 0 ? (
            <EmptyStatePremium
              variant="files"
              title="Recycle bin is empty"
              description="Deleted leads will appear here. You can restore them or permanently delete."
              icon={Trash2}
            />
          ) : (
            <ul className="space-y-2">
              {data.items.map((l) => (
                <li
                  key={l.id}
                  className="surface-inset flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{l.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      ID {l.id} · deleted{' '}
                      {l.deleted_at ? new Date(l.deleted_at).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <LeadContactActions phone={l.phone} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={patchMut.isPending}
                      onClick={() => void patchMut.mutateAsync({ id: l.id, body: { restored: true } })}
                    >
                      {patchMut.isPending ? 'Restoring…' : 'Restore'}
                    </Button>
                    {canPermanentlyDelete ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={permanentDeleteMut.isPending}
                        onClick={() => void permanentDeleteMut.mutateAsync(l.id)}
                      >
                        {permanentDeleteMut.isPending ? 'Deleting…' : 'Delete permanently'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {patchMut.isError || permanentDeleteMut.isError ? (
            <p className="mt-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {patchMut.error instanceof Error
                ? patchMut.error.message
                : permanentDeleteMut.error instanceof Error
                  ? permanentDeleteMut.error.message
                  : 'Action failed'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
