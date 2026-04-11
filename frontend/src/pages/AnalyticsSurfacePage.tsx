import { InsightList } from '@/components/dashboard/InsightList'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAnalyticsSurfaceQuery,
  type AnalyticsSurface,
} from '@/hooks/use-analytics-surface-query'

type Props = {
  title: string
  surface: AnalyticsSurface
}

export function AnalyticsSurfacePage({ title, surface }: Props) {
  const { data, isPending, isError, error, refetch } = useAnalyticsSurfaceQuery(surface)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>

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
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          <p className="text-ds-caption">
            Total: <span className="font-medium text-foreground">{data.total}</span>
          </p>
          <InsightList items={data.items} />
        </div>
      ) : null}
    </div>
  )
}
