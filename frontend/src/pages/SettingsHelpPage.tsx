import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'

type Props = { title: string }

export function SettingsHelpPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/help')

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

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
        <div className="space-y-4">
          {data.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}
          <ul className="space-y-3">
            {data.items.map((row, i) => (
              <li key={i} className="surface-elevated rounded-xl p-4">
                <h2 className="font-medium text-foreground">
                  {typeof row.title === 'string' ? row.title : `Topic ${i + 1}`}
                </h2>
                {typeof row.detail === 'string' ? (
                  <p className="mt-2 text-sm text-muted-foreground">{row.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
