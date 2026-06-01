import { cn } from '@/lib/utils'
import { useReassignEligibleQuery, LEVEL_COLORS } from '@/hooks/use-xp-query'
import { Skeleton } from '@/components/ui/skeleton'

type Props = {
  leadName: string
  isReassigned: boolean
  onClose: () => void
  onConfirm: (userId: number, userName: string) => void
  onRevert: () => void
  busy: boolean
  reverting: boolean
  revertNotice: string | null
}

export function LeaderReassignSheet({
  leadName,
  isReassigned,
  onClose,
  onConfirm,
  onRevert,
  busy,
  reverting,
  revertNotice,
}: Props) {
  const { data, isPending, isError } = useReassignEligibleQuery()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <p className="text-ds-caption text-muted-foreground">Reassign lead</p>
          <h2 className="truncate text-sm font-semibold text-foreground">{leadName}</h2>
        </div>

        <div className="border-b border-border px-4 py-3">
          <button
            type="button"
            disabled={reverting || busy}
            onClick={onRevert}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50',
              isReassigned
                ? 'border-orange-500/40 bg-orange-500/[0.08] text-orange-600 hover:bg-orange-500/15 dark:text-orange-300'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/60',
            )}
          >
            {reverting ? 'Reverting…' : 'Revert to original assignee'}
          </button>
          <p
            className={cn(
              'mt-2 text-ds-caption',
              revertNotice ? 'text-orange-600 dark:text-orange-300' : 'text-muted-foreground',
            )}
          >
            {revertNotice ?? 'Undoes the last reassignment and restores the previous assignee. Stage stays the same.'}
          </p>
        </div>

        <div className="px-4 py-3">
          <p className="mb-3 text-ds-caption text-muted-foreground">
            Top performers by 7-day process score
          </p>

          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : isError || !data?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No eligible team members found.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.map((entry, idx) => {
                const colors = LEVEL_COLORS[entry.level] ?? LEVEL_COLORS['rookie']
                return (
                  <li key={entry.user_id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onConfirm(entry.user_id, entry.name)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-left transition',
                        'hover:border-primary/40 hover:bg-muted/60 active:scale-[0.98] disabled:opacity-50',
                        idx === 0 && 'border-amber-500/30 bg-amber-500/[0.06]',
                      )}
                    >
                      <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-foreground">
                        {entry.name}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold',
                          colors.bg, colors.text, colors.border,
                        )}
                      >
                        {(entry.level_label ?? entry.level).toUpperCase()}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {(entry.process_score_7d ?? 0)} pts
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border bg-muted/50 py-2 text-sm text-muted-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
