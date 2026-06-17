import { Link } from 'react-router-dom'

import { LeadBillingCard } from '@/components/leads/LeadBillingCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { usePendingAsQuery } from '@/hooks/use-pending-as-query'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'

type Props = {
  title: string
}

export function PendingAsProcessPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = usePendingAsQuery()
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="min-w-0 max-w-full truncate text-ds-h2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Converted leads jinka FOREVER (FLP) invoice / CC process abhi pending hai. Invoice upload
        karo — clear scan auto-approve ho jata hai, warna admin approval pending rehti hai. Approve
        hote hi CC / revenue / cheque records me chala jata hai.
      </p>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
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
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Pending: {data.total}</p>
          {data.items.length === 0 ? (
            <p className="surface-elevated p-4 text-sm text-muted-foreground">
              No pending AS process — har converted lead ka FLP invoice approve ho chuka hai. 🎉
            </p>
          ) : (
            data.items.map((l) => (
              <div key={l.id} className="surface-elevated space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/dashboard/work/leads/${l.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {l.name}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      #{l.id}
                      {l.phone?.trim() ? ` · ${l.phone}` : ''}
                      {l.stage_selected ? ` · ${l.stage_selected}` : ''}
                    </span>
                  </div>
                </div>
                <LeadBillingCard leadId={l.id} surfaceRole={surfaceRole} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
