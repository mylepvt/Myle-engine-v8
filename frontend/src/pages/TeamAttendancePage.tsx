import { useNavigate } from 'react-router-dom'
import { RefreshCw, MapPin, Clock } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { useTeamLocationsQuery, type TeamLocationEntry } from '@/hooks/use-location-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function LocationChip({ entry }: { entry: TeamLocationEntry }) {
  const hasLocation = entry.city || entry.state
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border dark:border-white/[0.08] bg-muted/20 dark:bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground/90 truncate">{entry.name ?? '—'}</p>
        {hasLocation ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
            {[entry.city, entry.state].filter(Boolean).join(', ')}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/40">No location yet</p>
        )}
      </div>
      {entry.updated_at && (
        <div className="flex items-center gap-1 shrink-0 text-[11px] text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          {timeAgo(entry.updated_at)}
        </div>
      )}
    </div>
  )
}

export function TeamAttendancePage({ title }: Props) {
  const navigate = useNavigate()
  const { data, isPending, isError, error, isFetching, refetch } = useTeamLocationsQuery()

  const sorted = [...(data?.items ?? [])].sort((a, b) => {
    if (a.updated_at && !b.updated_at) return -1
    if (!a.updated_at && b.updated_at) return 1
    if (a.updated_at && b.updated_at) return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    return (a.name ?? '').localeCompare(b.name ?? '')
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-primary hover:underline underline-offset-2">
            ← Back
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border dark:border-white/[0.08] bg-muted/20 dark:bg-white/[0.04] text-muted-foreground transition hover:bg-muted/40 dark:hover:bg-white/[0.08] disabled:opacity-40"
          aria-label="Refresh location data"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground/50">
          {data.items.filter(i => i.updated_at).length} of {data.total} members shared location
        </p>
      )}

      {isPending && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[60px] w-full rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}
          <button type="button" className="ml-2 underline underline-offset-2" onClick={() => void refetch()}>Retry</button>
        </div>
      )}

      {data && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((e) => <LocationChip key={e.user_id} entry={e} />)}
        </div>
      )}

      {data && sorted.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground/50">No team members found.</p>
      )}
    </div>
  )
}
