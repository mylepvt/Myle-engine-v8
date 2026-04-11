import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { useMyTeamQuery } from '@/hooks/use-team-query'

type Props = { title: string }

export function MyTeamPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useMyTeamQuery()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <Link
          to="/dashboard/work/leads"
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Work
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        V1 shows only your own profile. When the product adds reporting lines or downlines, this view will list people
        under you without duplicating rules in the UI.
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
        <div className="surface-elevated p-4 text-sm">
          <ul className="space-y-2">
            {data.items.map((m) => (
              <li
                key={m.id}
                className="surface-inset px-3 py-2 text-muted-foreground"
              >
                <span className="font-medium text-foreground">{m.fbo_id}</span>
                {m.username ? (
                  <span className="text-muted-foreground"> · {m.username}</span>
                ) : null}
                <span className="mt-0.5 block text-xs text-muted-foreground">{m.email}</span>
                <span className="mt-0.5 block text-xs">
                  {m.role} · joined {new Date(m.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
