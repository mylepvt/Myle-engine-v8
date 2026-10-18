import { useEffect, useState } from 'react'
import { CheckCheck, Headphones, X } from 'lucide-react'

import { useBackClose } from '@/hooks/use-back-close'
import { useNoticeListenersQuery, type ListenerRow } from '@/hooks/use-notice-board-query'
import { cn } from '@/lib/utils'

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ row, played }: { row: ListenerRow; played: boolean }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
        {row.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {row.name}
          {row.role === 'leader' ? (
            <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-px align-middle text-ds-micro font-medium text-primary">
              Leader
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {played
            ? `${when(row.first_played_at)}${row.play_count > 1 ? ` · played ${row.play_count}×` : ''}`
            : row.fbo_id ?? ''}
        </p>
      </div>
      {played ? (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-ds-micro font-medium',
            row.completed ? 'bg-success/15 text-success-ink' : 'bg-warning/15 text-warning-ink',
          )}
        >
          {row.completed ? <CheckCheck className="size-3.5" /> : null}
          {row.completed ? 'Full' : 'Partly'}
        </span>
      ) : null}
    </li>
  )
}

/** Admin: who played a voice notice and who still hasn't. */
export function NoticeListenersDialog({ noticeId, onClose }: { noticeId: number | null; onClose: () => void }) {
  const open = noticeId != null
  const [tab, setTab] = useState<'played' | 'not_played'>('played')
  const query = useNoticeListenersQuery(noticeId)
  useBackClose({ open, onClose })

  useEffect(() => {
    if (open) setTab('played')
  }, [open, noticeId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const data = query.data
  const rows = data ? (tab === 'played' ? data.played : data.not_played) : []

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Voice notice listeners"
    >
      <div
        className="surface-elevated flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Headphones className="size-5 text-primary" /> Who listened
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        {data ? (
          <>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  {data.played.length} of {data.audience_count} members played it
                </span>
                <span>
                  {data.audience_count > 0 ? Math.round((data.played.length / data.audience_count) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${data.audience_count > 0 ? (data.played.length / data.audience_count) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1 text-sm">
              {(['played', 'not_played'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    'rounded-md py-1.5 font-medium transition-colors',
                    tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {key === 'played' ? `Played (${data.played.length})` : `Not played (${data.not_played.length})`}
                </button>
              ))}
            </div>
            <ul className="mt-2 min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
              {rows.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {tab === 'played' ? 'Nobody has played it yet.' : 'Everyone has played it.'}
                </li>
              ) : (
                rows.map((r) => <Row key={r.user_id} row={r} played={tab === 'played'} />)
              )}
            </ul>
          </>
        ) : query.isError ? (
          <p className="mt-4 text-sm text-destructive">Could not load listeners.</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </div>
  )
}
