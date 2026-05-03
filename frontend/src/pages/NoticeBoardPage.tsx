import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useNoticeBoardMutations, useNoticeBoardQuery } from '@/hooks/use-notice-board-query'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import { cn } from '@/lib/utils'

type Props = { title: string }

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function NoticeBoardPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const { data, isPending, isError, error, refetch } = useNoticeBoardQuery()
  const { create, remove, togglePin } = useNoticeBoardMutations()

  const { markAllSeen } = useNoticeBoardUnread()

  // Mark all notices as seen when this page is visited
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markAllSeen() }, [])

  const [message, setMessage] = useState('')
  const [pinNew, setPinNew] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const m = message.trim()
    if (!m) {
      setFormError('Message cannot be empty.')
      return
    }
    try {
      await create.mutateAsync({ message: m, pin: pinNew })
      setMessage('')
      setPinNew(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Organization notices — pinned items appear first (same behavior as the previous app).
      </p>

      {isAdmin ? (
        <form
          onSubmit={(e) => void handlePost(e)}
          className="surface-elevated space-y-3 p-5 text-sm"
        >
          <h2 className="font-medium text-foreground">Post announcement</h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={create.isPending}
            rows={4}
            placeholder="Type your announcement here…"
            className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2.5 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
          />
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={pinNew}
              onChange={(e) => setPinNew(e.target.checked)}
              disabled={create.isPending}
              className="size-4 rounded border-white/25 accent-primary"
            />
            Pin to top
          </label>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Posting…' : 'Post'}
          </Button>
        </form>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Showing {data.items.length} of {data.total} notice{data.total === 1 ? '' : 's'}
          </p>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : null}
          <ul className="space-y-3">
            {data.items.map((row) => (
              <li
                key={row.id}
                className={cn(
                  'surface-elevated rounded-xl border p-4 text-sm',
                  row.pin ? 'border-primary/35 bg-primary/[0.06]' : 'border-border/60',
                )}
              >
                {row.pin ? (
                  <span className="mb-2 inline-block rounded-md bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                    Pinned
                  </span>
                ) : null}
                <p className="whitespace-pre-wrap text-foreground">{row.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.created_by} · {formatWhen(row.created_at)}
                </p>
                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={togglePin.isPending}
                      onClick={() => void togglePin.mutateAsync(row.id)}
                    >
                      {row.pin ? 'Unpin' : 'Pin'}
                    </Button>
                    {deleteConfirmId === row.id ? (
                      <>
                        <span className="self-center text-xs text-muted-foreground">Sure?</span>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={remove.isPending}
                         
                          onClick={() => {
                            void remove.mutateAsync(row.id).finally(() => setDeleteConfirmId(null))
                          }}
                        >
                          Yes, delete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={remove.isPending}
                        onClick={() => setDeleteConfirmId(row.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
