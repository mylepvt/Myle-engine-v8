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
        shared). Agar videos list khali hai to DB mein{' '}
        <code className="rounded bg-white/10 px-1">training_videos</code> seed karein — Alembic:{' '}
        <code className="rounded bg-white/10 px-1">20260413_0020_seed_seven_training_videos</code>{' '}
        (<code className="rounded bg-white/10 px-1">backend/alembic/versions/</code>).
      </p>
      <p className="text-xs text-muted-foreground">
        Workboard par Day 1/2/3 <strong>batch slots</strong> (Morning / Afternoon / Evening) har lead card
        par hi mark hote hain — alag “admin batch link” URL legacy ki tarah yahan ek hi workboard flow
        mein hai.
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
