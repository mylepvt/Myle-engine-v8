import { useState } from 'react'
import { Loader2, MessageCircle, SendHorizontal, Trash2 } from 'lucide-react'

import { useNoticeRepliesQuery, useNoticeReplyMutations } from '@/hooks/use-notice-board-query'
import { cn } from '@/lib/utils'

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(diff)) return ''
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Collapsible reply thread under a notice. Everyone can read and reply; authors and admins can delete. */
export function NoticeReplies({ noticeId, count }: { noticeId: number; count: number }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const replies = useNoticeRepliesQuery(noticeId, open)
  const { add, remove } = useNoticeReplyMutations(noticeId)

  async function send() {
    const text = draft.trim()
    if (!text || add.isPending) return
    setError(null)
    try {
      await add.mutateAsync(text)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reply')
    }
  }

  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <MessageCircle className="size-4" />
        {count > 0 ? `${count} ${count === 1 ? 'reply' : 'replies'}` : 'Reply'}
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          {replies.isPending ? (
            <p className="text-xs text-muted-foreground">Loading replies…</p>
          ) : replies.isError ? (
            <p className="text-xs text-destructive">Could not load replies.</p>
          ) : (
            <ul className="space-y-2">
              {replies.data?.items.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    'group rounded-lg px-3 py-2',
                    r.mine ? 'bg-primary/[0.08]' : 'bg-muted/50',
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-foreground">{r.mine ? 'You' : r.author}</span>
                    {r.role === 'leader' || r.role === 'admin' ? (
                      <span className="rounded bg-primary/15 px-1.5 py-px text-ds-micro font-medium capitalize text-primary">
                        {r.role}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">· {timeAgo(r.created_at)}</span>
                    {r.can_delete ? (
                      <button
                        type="button"
                        onClick={() => void remove.mutateAsync(r.id)}
                        disabled={remove.isPending}
                        aria-label="Delete reply"
                        className="ml-auto text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{r.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Write a reply…"
              aria-label="Write a reply"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            <button
              type="submit"
              disabled={!draft.trim() || add.isPending}
              aria-label="Send reply"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          </form>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
