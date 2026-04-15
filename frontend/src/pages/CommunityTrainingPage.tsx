import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { useOtherTrainingQuery } from '@/hooks/use-other-training-query'

type Props = { title: string }

export function CommunityTrainingPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useOtherTrainingQuery()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Required training track for field partners (same catalog as System → Training; progress is
        shared).
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
      {data && 'videos' in data ? <TrainingProgramPanel data={data} /> : null}
    </div>
  )
}
