import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEnrollmentRequestsQuery } from '@/hooks/use-team-query'
import { ClipboardList } from 'lucide-react'

type Props = { title: string }

export function EnrollmentApprovalsPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useEnrollmentRequestsQuery()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Review and approve paid enrollment requests (e.g. INR 196 tier).
      </p>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
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

      {data && data.total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] py-14 text-center">
          <ClipboardList className="size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No pending enrollment requests</p>
          <p className="text-xs text-muted-foreground">New requests will appear here for your review.</p>
        </div>
      ) : null}

      {data && data.total > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {data.total} pending request{data.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {data.items.map((row, i) => {
              const r = row as Record<string, unknown>
              const name = (r['name'] ?? r['username'] ?? r['fbo_id'] ?? `Request #${i + 1}`) as string
              const tier = r['tier'] ?? r['amount'] ?? r['plan']
              const status = (r['status'] ?? 'pending') as string
              const createdAt = r['created_at'] as string | undefined
              return (
                <li
                  key={(r['id'] as number | undefined) ?? i}
                  className="surface-elevated flex items-start justify-between gap-4 rounded-xl border border-white/[0.08] p-4 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{String(name)}</p>
                    {tier ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Tier: {String(tier)}
                      </p>
                    ) : null}
                    {createdAt ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'outline'}>
                      {String(status)}
                    </Badge>
                    {status === 'pending' ? (
                      <>
                        <Button size="sm" variant="default">Approve</Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10">Reject</Button>
                      </>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
