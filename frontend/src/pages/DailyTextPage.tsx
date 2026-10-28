import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, PenLine, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  shiftDate,
  todayIst,
  useDailyTextMutations,
  useDailyTextQuery,
  type DailyTextEntry,
} from '@/hooks/use-daily-text-query'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function Editor({ date, entry, onDone }: { date: string; entry: DailyTextEntry | null; onDone: () => void }) {
  const { save } = useDailyTextMutations()
  const [headline, setHeadline] = useState(entry?.headline ?? '')
  const [body, setBody] = useState(entry?.body ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync({ date, headline, body })
      onDone()
    } catch {
      /* error shown below */
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="jw-row space-y-4 p-4">
      <div>
        <label htmlFor="daily-headline" className="field-label">
          Quote / one-liner (shown on Home)
        </label>
        <Input
          id="daily-headline"
          value={headline}
          maxLength={300}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Small steps every day build big results."
          required
        />
        <p className="mt-1 text-right text-ds-micro text-muted-foreground">{headline.length}/300</p>
      </div>
      <div>
        <label htmlFor="daily-body" className="field-label">
          Full message (opens on tap)
        </label>
        <textarea
          id="daily-body"
          value={body}
          maxLength={10_000}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="field-input h-auto min-h-40 py-2.5"
          placeholder="Write the full message for this day…"
        />
      </div>
      {save.isError ? <p className="text-sm text-destructive-ink">{save.error.message}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !headline.trim()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

/** Daily Text: one message per day, opened from the Home card. Admins write and plan days ahead. */
export function DailyTextPage() {
  const [params, setParams] = useSearchParams()
  const today = todayIst()
  const raw = params.get('date') ?? ''
  const date = DATE_RE.test(raw) ? raw : today
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.role === 'admin'
  const query = useDailyTextQuery(date)
  const { remove } = useDailyTextMutations()
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const go = (days: number) => {
    setEditing(null)
    setParams({ date: shiftDate(date, days) }, { replace: true })
  }
  // Members read up to today; admins can move ahead to plan future days.
  const canGoNext = isAdmin || date < today
  const entry = query.data?.entry ?? null

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <nav aria-label="Day" className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => go(-1)} className="press flex size-10 items-center justify-center text-primary" aria-label="Previous day">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-ds-body font-semibold text-primary">{longDate(date)}</p>
          {date === today ? <p className="text-ds-caption text-muted-foreground">Today</p> : null}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canGoNext}
          className="press flex size-10 items-center justify-center text-primary disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="size-5" />
        </button>
      </nav>

      {query.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorState title="Could not load the message" message={query.error.message} onRetry={() => void query.refetch()} />
      ) : editing === date ? (
        <Editor key={date} date={date} entry={entry} onDone={() => setEditing(null)} />
      ) : (
        <article className="space-y-4">
          {entry ? (
            <>
              <h1 className="text-ds-h2 font-semibold leading-snug text-foreground">{entry.headline}</h1>
              {entry.body ? <p className="whitespace-pre-line text-ds-body leading-relaxed text-foreground/90">{entry.body}</p> : null}
            </>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No message for this day.</p>
          )}

          {isAdmin ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={() => setEditing(date)}>
                <PenLine />
                {entry ? 'Edit message' : 'Write message'}
              </Button>
              {entry ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={remove.isPending}>
                  <Trash2 />
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </article>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this day's message?"
        description={`The message for ${longDate(date)} will be removed for everyone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false)
          remove.mutate(date)
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
