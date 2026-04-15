import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'

type Props = { title: string }

export function SettingsOrgTreePage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/org-tree')

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Flat directory from <code className="rounded bg-white/10 px-1 text-xs">users.upline_user_id</code>.
        Sorting is by user id ascending.
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
        <div className="space-y-4">
          {data.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}
          <div className="surface-elevated overflow-x-auto p-3">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Line</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.06]">
                    <td className="py-2.5 pr-3 font-medium text-foreground">
                      {typeof row.title === 'string' ? row.title : '—'}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {typeof row.detail === 'string' ? row.detail : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 ? (
              <p className="mt-3 text-muted-foreground">No users in database.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
