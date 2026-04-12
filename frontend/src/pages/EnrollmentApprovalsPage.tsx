import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEnrollmentRequestsQuery } from '@/hooks/use-team-query'
import { ClipboardList } from 'lucide-react'

type Props = { title: string }

function pickStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function formatWhen(iso: string | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function EnrollmentApprovalsPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useEnrollmentRequestsQuery()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Review paid enrollment requests (e.g. INR 196 tier). The API currently returns an empty list until the queue is
        persisted; the layout below is ready when rows exist.
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
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {data.total} pending request{data.total === 1 ? '' : 's'}
          </p>
          <ul className="space-y-3">
            {data.items.map((row, i) => {
              const r = row as Record<string, unknown>
              const name = pickStr(r, ['username', 'name', 'full_name', 'email', 'fbo_id']) || `Request ${i + 1}`
              const tier = pickStr(r, ['tier', 'plan', 'product_tier', 'amount_label', 'amount'])
              const status = pickStr(r, ['status', 'registration_status', 'payment_status']) || 'pending'
              const created =
                typeof r.created_at === 'string'
                  ? r.created_at
                  : typeof r.submitted_at === 'string'
                    ? r.submitted_at
                    : undefined
              const id = typeof r.id === 'number' ? r.id : typeof r.user_id === 'number' ? r.user_id : i

              return (
                <li
                  key={`${id}-${i}`}
                  className="surface-elevated flex flex-col gap-3 rounded-xl border border-white/[0.08] p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">ID: {String(id)}</p>
                    </div>
                    <Badge
                      variant={
                        status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'outline'
                      }
                      className="shrink-0 capitalize"
                    >
                      {status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {tier ? (
                      <span>
                        <span className="text-foreground/80">Tier: </span>
                        {tier}
                      </span>
                    ) : null}
                    <span>
                      <span className="text-foreground/80">Submitted: </span>
                      {formatWhen(created)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled
                      title="Enrollment approve/reject API not wired in V1 (stub list)"
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      disabled
                      title="Enrollment approve/reject API not wired in V1 (stub list)"
                    >
                      Reject
                    </Button>
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
