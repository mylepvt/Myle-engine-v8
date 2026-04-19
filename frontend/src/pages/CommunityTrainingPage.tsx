import { GraduationCap, Clock3 } from 'lucide-react'

import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'
import { Badge } from '@/components/ui/badge'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useOtherTrainingQuery } from '@/hooks/use-other-training-query'

type Props = { title: string }

export function CommunityTrainingPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useOtherTrainingQuery()

  return (
    <div className="max-w-4xl space-y-5">
      <div className="surface-elevated overflow-hidden p-5 md:p-6">
        <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
          <GraduationCap className="size-3.5" />
          Training
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Finish all 7 days in order. Your progress is saved automatically anywhere you open this
          training.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="surface-inset inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5 text-primary" />
            <span>Session timing is updated from Workboard</span>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="surface-elevated p-4">
          <LoadingState label="Loading training..." />
        </div>
      ) : null}
      {isError ? (
        <ErrorState
          title="Could not load training"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : null}
      {data && 'videos' in data ? <TrainingProgramPanel data={data} /> : null}
    </div>
  )
}
