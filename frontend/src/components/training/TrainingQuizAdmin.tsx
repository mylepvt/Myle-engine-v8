import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { cn } from '@/lib/utils'

type Letter = 'a' | 'b' | 'c' | 'd'

export type AdminQuizQuestion = {
  id: number
  question: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: Letter
  sort_order: number
}

type Draft = Omit<AdminQuizQuestion, 'id'>

const LETTERS: Letter[] = ['a', 'b', 'c', 'd']
const QUERY_KEY = ['admin', 'training', 'questions'] as const

const emptyDraft = (sortOrder: number): Draft => ({
  question: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_answer: 'a',
  sort_order: sortOrder,
})

async function readOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(body, fallback))
  return body as T
}

/** Admin-only editor for the final-quiz question bank (answers are never sent to members). */
export function TrainingQuizAdmin() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () =>
      readOrThrow<{ items: AdminQuizQuestion[] }>(
        await apiFetch('/api/v1/admin/training/questions'),
        'Could not load quiz questions',
      ),
  })
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft(1))
  const [err, setErr] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY })

  const save = useMutation({
    mutationFn: async () => {
      const isNew = editingId === 'new'
      const res = await apiFetch(
        isNew ? '/api/v1/admin/training/questions' : `/api/v1/admin/training/questions/${editingId}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        },
      )
      return readOrThrow<AdminQuizQuestion>(res, 'Could not save the question')
    },
    onSuccess: () => {
      setEditingId(null)
      void refresh()
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save the question'),
  })

  const remove = useMutation({
    mutationFn: async (id: number) =>
      readOrThrow(
        await apiFetch(`/api/v1/admin/training/questions/${id}`, { method: 'DELETE' }),
        'Could not delete the question',
      ),
    onSuccess: () => void refresh(),
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not delete the question'),
  })

  const items = list.data?.items ?? []
  const answerSpread = LETTERS.map((l) => items.filter((q) => q.correct_answer === l).length)

  const startEdit = (q: AdminQuizQuestion | null) => {
    setErr(null)
    if (q) {
      const { id, ...rest } = q
      setEditingId(id)
      setDraft(rest)
    } else {
      setEditingId('new')
      setDraft(emptyDraft(items.length + 1))
    }
  }

  const canSave =
    draft.question.trim().length >= 3 && LETTERS.every((l) => draft[`option_${l}`].trim().length > 0)

  const editor = (
    <div className="space-y-2 rounded border border-primary/30 bg-primary/[0.04] p-3">
      <label className="block text-ds-caption text-muted-foreground">
        Question
        <textarea
          className="field-input mt-1 min-h-[64px] w-full"
          value={draft.question}
          onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
        />
      </label>
      {LETTERS.map((l) => (
        <div key={l} className="flex items-center gap-2">
          <input
            type="radio"
            name="quiz-correct"
            aria-label={`Option ${l.toUpperCase()} is correct`}
            className="accent-primary"
            checked={draft.correct_answer === l}
            onChange={() => setDraft((d) => ({ ...d, correct_answer: l }))}
          />
          <span className="w-4 text-ds-caption font-semibold text-foreground">{l.toUpperCase()}</span>
          <input
            className="field-input w-full"
            value={draft[`option_${l}`]}
            placeholder={`Option ${l.toUpperCase()}`}
            onChange={(e) => setDraft((d) => ({ ...d, [`option_${l}`]: e.target.value }))}
          />
        </div>
      ))}
      <p className="text-ds-caption text-muted-foreground">Tick the circle next to the correct option.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving...' : 'Save question'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div className="rounded-md border border-border dark:border-white/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-ds-body font-semibold text-foreground">Quiz questions (admin)</p>
          <p className="mt-1 text-ds-caption text-muted-foreground">
            Members see these in a random order with the options shuffled, so write questions from the
            training videos — not ones anyone can guess.
          </p>
        </div>
        {editingId === null ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(null)}>
            Add question
          </Button>
        ) : null}
      </div>

      {list.isError ? (
        <p className="mt-3 text-ds-caption text-destructive">
          {list.error instanceof Error ? list.error.message : 'Could not load quiz questions'}
        </p>
      ) : null}
      {err ? (
        <p className="mt-3 text-ds-caption text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {items.length > 0 ? (
        <p className="mt-3 text-ds-caption text-muted-foreground">
          {items.length} question{items.length === 1 ? '' : 's'} · correct answers: A {answerSpread[0]}, B{' '}
          {answerSpread[1]}, C {answerSpread[2]}, D {answerSpread[3]}
          {items.length < 10 ? ' · add at least 10 for a fair test' : ''}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {editingId === 'new' ? editor : null}
        {items.map((q, index) =>
          editingId === q.id ? (
            <div key={q.id}>{editor}</div>
          ) : (
            <div key={q.id} className="rounded border border-border dark:border-white/10 bg-muted/30 p-3">
              <p className="text-ds-body text-foreground">
                <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                {q.question}
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {LETTERS.map((l) => (
                  <li
                    key={l}
                    className={cn(
                      'text-ds-caption',
                      q.correct_answer === l ? 'font-semibold text-success-ink' : 'text-muted-foreground',
                    )}
                  >
                    {l.toUpperCase()}. {q[`option_${l}`]}
                    {q.correct_answer === l ? ' ✓' : ''}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={editingId !== null} onClick={() => startEdit(q)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={editingId !== null || remove.isPending}
                  onClick={() => {
                    if (window.confirm('Delete this question?')) remove.mutate(q.id)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
