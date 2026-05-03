import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useAddLeadNote, useDeleteLeadNote, useLeadNotesQuery } from '@/hooks/use-lead-notes-query'

type Props = {
  leadId: number
}

export function LeadNotesPanel({ leadId }: Props) {
  const notesQuery = useLeadNotesQuery(leadId)
  const addNote = useAddLeadNote()
  const deleteNote = useDeleteLeadNote()
  const meQuery = useAuthMeQuery()

  const [body, setBody] = useState('')
  const [addError, setAddError] = useState('')

  const currentUserId = meQuery.data?.user_id ?? null
  const isAdmin = meQuery.data?.role === 'admin'

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setAddError('')
    try {
      await addNote.mutateAsync({ leadId, body: text })
      setBody('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add note')
    }
  }

  async function handleDelete(noteId: number) {
    try {
      await deleteNote.mutateAsync({ leadId, noteId })
    } catch {
      /* silently ignore — query will reflect current state */
    }
  }

  return (
    <div className="surface-elevated p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Notes</p>

      {notesQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : notesQuery.data && notesQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notesQuery.data?.map((note) => (
            <li key={note.id} className="surface-inset px-3 py-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground whitespace-pre-wrap break-words">{note.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.display_name ?? 'Unknown'} &middot;{' '}
                    {new Date(note.created_at).toLocaleString()}
                  </p>
                </div>
                {(isAdmin || note.user_id === currentUserId) && (
                  <button
                    type="button"
                    className="ml-2 shrink-0 text-xs text-destructive hover:text-destructive/80 underline-offset-2 hover:underline"
                    disabled={deleteNote.isPending}
                    onClick={() => void handleDelete(note.id)}
                    aria-label="Delete note"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleAdd(e)} className="space-y-2">
        <textarea
          id="lead-notes-input"
          aria-label="Add a note"
          aria-invalid={!!addError}
          aria-describedby={addError ? 'lead-notes-error' : undefined}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-white/12 bg-muted/50 px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 resize-none"
          placeholder="Add a note (call notes, follow-up notes…)"
        />
        {addError ? (
          <p id="lead-notes-error" className="text-xs text-destructive" role="alert">
            {addError}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={addNote.isPending || !body.trim()}>
          {addNote.isPending ? 'Adding…' : 'Add Note'}
        </Button>
      </form>
    </div>
  )
}
