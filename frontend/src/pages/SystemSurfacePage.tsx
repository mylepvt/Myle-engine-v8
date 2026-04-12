import { useCallback, useState } from 'react'

import { InsightList } from '@/components/dashboard/InsightList'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useSystemSurfaceQuery,
  type SystemSurface,
} from '@/hooks/use-system-surface-query'
import { apiFetch } from '@/lib/api'

type Props = {
  title: string
  surface: SystemSurface
}

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
}

function TrainingCertificationBlock() {
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
        const t = await r.text()
        throw new Error(t || r.statusText)
      }
      setQuestions((await r.json()) as TrainingQuestionRow[])
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
      const body = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(
          typeof body === 'object' && body !== null && 'detail' in body
            ? String((body as { detail?: string }).detail)
            : r.statusText,
        )
      }
      setResult(body as TrainingTestResultRow)
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
        </p>
      ) : null}
    </div>
  )
}

export function SystemSurfacePage({ title, surface }: Props) {
  const { data, isPending, isError, error, refetch } = useSystemSurfaceQuery(surface)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>

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
      {data && surface === 'training' && 'videos' in data ? (
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          {(() => {
            const vids = Array.isArray(data.videos) ? data.videos : []
            if (vids.length === 0) {
              return <p>No training days configured yet.</p>
            }
            return (
              <ul className="list-inside list-disc space-y-2 text-foreground/90">
                {vids.map((v) => (
                  <li key={v.day_number}>
                    Day {v.day_number}: {v.title}
                  </li>
                ))}
              </ul>
            )
          })()}
          {(() => {
            const prog = Array.isArray(data.progress) ? data.progress : []
            return prog.length > 0 ? (
              <p className="text-ds-caption">
                Progress rows:{' '}
                <span className="font-medium text-foreground">{prog.length}</span>
              </p>
            ) : null
          })()}
          <TrainingCertificationBlock />
        </div>
      ) : null}
      {data && surface === 'training' && !('videos' in data) && 'items' in data ? (
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {'note' in data && data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          <p className="text-ds-caption">
            Signals:{' '}
            <span className="font-medium text-foreground">
              {'total' in data ? data.total : 0}
            </span>
          </p>
          <InsightList items={Array.isArray(data.items) ? data.items : []} />
        </div>
      ) : null}
      {data && surface !== 'training' ? (
        <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
          {'note' in data && data.note ? <p className="text-foreground/90">{data.note}</p> : null}
          <p className="text-ds-caption">
            Signals:{' '}
            <span className="font-medium text-foreground">
              {'total' in data && typeof data.total === 'number' ? data.total : 0}
            </span>
          </p>
          <InsightList
            items={Array.isArray((data as { items?: unknown }).items) ? (data as { items: Record<string, unknown>[] }).items : []}
          />
        </div>
      ) : null}
    </div>
  )
}
