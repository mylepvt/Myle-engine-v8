import { useCallback, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import { apiFetch } from '@/lib/api'
import { authSyncIdentity } from '@/lib/auth-api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

type TrainingQuestionRow = {
  id: number
  question: string
  options: Record<string, string>
}

type TrainingTestResultRow = {
  passed: boolean
  percent: number
  score: number
  total_questions: number
  pass_mark_percent: number
  training_completed?: boolean
}

function TrainingDaysBlock({
  data,
  onSessionRefresh,
}: {
  data: TrainingSurfacePayload
  onSessionRefresh: () => Promise<void>
}) {
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const done = new Map(progress.filter((p) => p.completed).map((p) => [p.day_number, true]))
  const [loadingDay, setLoadingDay] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const mark = async (dayNumber: number) => {
    setLoadingDay(dayNumber)
    setErr(null)
    try {
      const r = await apiFetch('/api/v1/system/training/mark-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_number: dayNumber }),
      })
      const body: unknown = await r.json().catch(() => null)
      if (!r.ok) {
        throw new Error(messageFromApiErrorPayload(body, r.statusText))
      }
      await onSessionRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save progress')
    } finally {
      setLoadingDay(null)
    }
  }

  if (vids.length === 0) {
    return <p className="text-foreground/90">No training days configured yet.</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">7-day program</p>
      <p className="text-ds-caption text-muted-foreground">
        Mark each day complete after watching. When all days are done, your training gate clears
        (same as passing the certification test below).
      </p>
      <ul className="space-y-2">
        {vids.map((v) => {
          const isDone = done.has(v.day_number)
          return (
            <li
              key={v.day_number}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-foreground/90"
            >
              <span className="text-sm">
                <span className="font-medium">Day {v.day_number}</span>
                <span className="text-muted-foreground"> — {v.title}</span>
              </span>
              {v.youtube_url ? (
                <a
                  href={v.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Watch →
                </a>
              ) : null}
              {isDone ? (
                <span className="text-xs font-medium text-emerald-400">Completed</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  disabled={loadingDay === v.day_number}
                  onClick={() => void mark(v.day_number)}
                >
                  {loadingDay === v.day_number ? 'Saving…' : 'Mark complete'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {err ? (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}

function TrainingCertificationBlock({
  onSessionRefresh,
}: {
  onSessionRefresh: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [questions, setQuestions] = useState<TrainingQuestionRow[] | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [result, setResult] = useState<TrainingTestResultRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setResult(null)
    try {
      const r = await apiFetch('/api/v1/system/training-test/questions')
      if (!r.ok) {
        const raw: unknown = await r.json().catch(() => null)
        throw new Error(messageFromApiErrorPayload(raw, r.statusText))
      }
      const parsed: unknown = await r.json()
      const list = Array.isArray(parsed) ? parsed : []
      const cleaned: TrainingQuestionRow[] = []
      for (const x of list) {
        if (!x || typeof x !== 'object') continue
        const o = x as Record<string, unknown>
        const id = typeof o.id === 'number' ? o.id : Number(o.id)
        const question = typeof o.question === 'string' ? o.question : ''
        const options = o.options && typeof o.options === 'object' ? (o.options as Record<string, string>) : {}
        if (!Number.isFinite(id) || !question) continue
        cleaned.push({ id, question, options })
      }
      setQuestions(cleaned)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load test')
    } finally {
      setLoading(false)
    }
  }, [])

  const submit = async () => {
    if (!questions?.length) return
    setLoading(true)
    setErr(null)
    try {
      const answersPayload: Record<string, string> = {}
      for (const q of questions) {
        const a = answers[q.id]
        if (a) answersPayload[String(q.id)] = a
      }
      const r = await apiFetch('/api/v1/system/training-test/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersPayload }),
      })
      const body: unknown = await r.json().catch(() => null)
      if (!r.ok) {
        throw new Error(messageFromApiErrorPayload(body, r.statusText))
      }
      const resultBody = body as TrainingTestResultRow
      setResult(resultBody)
      if (resultBody.passed && resultBody.training_completed) {
        await onSessionRefresh()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="mb-2 text-sm font-medium text-foreground">Certification test</p>
      {questions === null ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load questions'}
        </button>
      ) : questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No questions configured yet.</p>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <fieldset key={q.id} className="space-y-1.5">
              <legend className="text-xs text-foreground/90">{q.question}</legend>
              <div className="flex flex-wrap gap-2">
                {(['a', 'b', 'c', 'd'] as const).map((letter) => (
                  <label
                    key={letter}
                    className="flex cursor-pointer items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-xs"
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      className="accent-primary"
                      checked={answers[q.id] === letter}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: letter }))}
                    />
                    <span className="text-muted-foreground">{letter.toUpperCase()}:</span>
                    <span>{q.options[letter] ?? '—'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50"
          >
            Submit answers
          </button>
        </div>
      )}
      {err ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      {result ? (
        <p className="mt-2 text-xs text-foreground/90">
          Score {result.score}/{result.total_questions} ({result.percent}%) —{' '}
          {result.passed ? (
            <span className="font-medium text-emerald-400">Passed</span>
          ) : (
            <span className="font-medium text-amber-300">
              Below pass mark ({result.pass_mark_percent}%)
            </span>
          )}
          {result.passed && result.training_completed ? (
            <span className="ml-1 text-emerald-400/90">
              — Training complete. You can use the full dashboard now.
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

type Props = {
  data: TrainingSurfacePayload
}

export function TrainingProgramPanel({ data }: Props) {
  const qc = useQueryClient()

  const onSessionRefresh = useCallback(async () => {
    await authSyncIdentity()
    await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    await qc.invalidateQueries({ queryKey: ['system', 'training'] })
    await qc.invalidateQueries({ queryKey: ['other', 'training'] })
  }, [qc])

  return (
    <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
      {data.note ? <p className="text-foreground/90">{data.note}</p> : null}
      <TrainingDaysBlock data={data} onSessionRefresh={onSessionRefresh} />
      <TrainingCertificationBlock onSessionRefresh={onSessionRefresh} />
    </div>
  )
}
