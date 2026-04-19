import { InsightList } from '@/components/dashboard/InsightList'
import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'
import { ErrorState, LoadingState } from '@/components/ui/states'
import {
  useSystemSurfaceQuery,
  type SystemSurface,
} from '@/hooks/use-system-surface-query'

type Props = {
  title: string
  surface: SystemSurface
}

export function SystemSurfacePage({ title, surface }: Props) {
  const { data, isPending, isError, error, refetch } = useSystemSurfaceQuery(surface)

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>

      {isPending ? (
        <div className="surface-elevated p-4">
          <LoadingState label="Loading..." />
        </div>
      ) : null}
      {isError ? (
        <ErrorState
          title={`Could not load ${title.toLowerCase()}`}
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : null}
      {data && surface === 'training' && 'videos' in data ? <TrainingProgramPanel data={data} /> : null}
      {data && surface === 'training' && !('videos' in data) && 'items' in data ? (
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {'note' in data && data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          <p className="text-ds-caption text-muted-foreground">
            Items:{' '}
            <span className="font-medium text-foreground">
              {'total' in data ? data.total : 0}
            </span>
          </p>
          <InsightList items={Array.isArray(data.items) ? data.items : []} />
        </div>
      ) : null}
      {data && surface !== 'training' ? (
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {'note' in data && data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          <p className="text-ds-caption text-muted-foreground">
            Items:{' '}
            <span className="font-medium text-foreground">
              {'total' in data && typeof data.total === 'number' ? data.total : 0}
            </span>
          </p>
          <InsightList
            items={Array.isArray((data as { items?: unknown }).items) ? (data as { items: Record<string, unknown>[] }).items : []}
          />
        </div>
      ) : null}
    </div>
  )
}
