import { useCallback, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { TrainingDayAdmin } from '@/components/training/TrainingDayAdmin'
import { TrainingDayView } from '@/components/training/TrainingDayView'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import { useDownloadCertificateMutation } from '@/hooks/use-training-query'
import { apiFetch } from '@/lib/api'
import { authSyncIdentity } from '@/lib/auth-api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

// ---------------------------------------------------------------------------
// Training question types (kept here for certification block)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Training days block
// ---------------------------------------------------------------------------

function TrainingDaysBlock({
  data,
  onSessionRefresh,
  canEditTrainingContent,
  canBypassTrainingLocks,
}: {
  data: TrainingSurfacePayload
  onSessionRefresh: () => Promise<void>
  canEditTrainingContent: boolean
  canBypassTrainingLocks: boolean
}) {
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const notes = Array.isArray(data.notes) ? data.notes : []

  const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.day_number))
  const notesSet = new Set(notes.map((n) => n.day_number))

  if (vids.length === 0) {
    return <p className="text-foreground/90">No training days configured yet.</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">7-day program</p>
      <p className="text-ds-caption text-muted-foreground">
        Watch each video, listen to the audio, upload your notes, then mark the day complete.
      </p>
      <div className="space-y-3">
        {vids.map((v) => (
          <div key={v.day_number} className="min-w-0">
            <TrainingDayView
              video={v}
              completed={doneSet.has(v.day_number)}
              hasNotes={notesSet.has(v.day_number)}
              onRefresh={onSessionRefresh}
              canBypassTrainingLocks={canBypassTrainingLocks}
            />
            {canEditTrainingContent ? <TrainingDayAdmin dayNumber={v.day_number} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Certificate download block — shown after training_status = 'completed'
// ---------------------------------------------------------------------------

function CertificateDownloadBlock() {
  const downloadMut = useDownloadCertificateMutation()
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-4 py-4 space-y-3 text-center">
      <p className="text-base font-semibold text-emerald-400">🎉 Training Complete!</p>
      <p className="text-xs text-muted-foreground">
        Your certificate is ready. Download it below — your name is printed on it automatically.
      </p>
      <Button
        type="button"
        size="sm"
        disabled={downloadMut.isPending}
        onClick={() => downloadMut.mutate()}
        className="gap-2"
      >
        {downloadMut.isPending ? 'Generating…' : '⬇ Download Certificate (PDF)'}
      </Button>
      {downloadMut.isError && (
        <p className="text-xs text-destructive" role="alert">
          {downloadMut.error instanceof Error ? downloadMut.error.message : 'Download failed'}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Certification block (unchanged logic, kept intact)
// ---------------------------------------------------------------------------

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
        <div className="mt-2 space-y-2">
          <p className="text-xs text-foreground/90">
            Score {result.score}/{result.total_questions} ({result.percent}%) —{' '}
            {result.passed ? (
              <span className="font-medium text-emerald-400">Passed ✓</span>
            ) : (
              <span className="font-medium text-amber-300">
                Below pass mark ({result.pass_mark_percent}%) — try again
              </span>
            )}
          </p>
          {result.passed && result.training_completed ? (
            <CertificateDownloadBlock />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

type Props = {
  data: TrainingSurfacePayload
}

export function TrainingProgramPanel({ data }: Props) {
  const qc = useQueryClient()
  const { data: me } = useAuthMeQuery()
  const { serverRole, isAdminPreviewing } = useDashboardShellRole()

  const onSessionRefresh = useCallback(async () => {
    await authSyncIdentity()
    await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    await qc.invalidateQueries({ queryKey: ['system', 'training'] })
    await qc.invalidateQueries({ queryKey: ['other', 'training'] })
    await qc.invalidateQueries({ queryKey: ['training', 'surface'] })
  }, [qc])

  /** Real JWT admin — never the shell “view as” preview role. */
  const canEditTrainingContent = serverRole === 'admin' && !isAdminPreviewing
  /** Unlock all days for real admin sessions only. */
  const canBypassTrainingLocks = serverRole === 'admin' && !isAdminPreviewing

  const trainingStatus = me?.training_status ?? ''

  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.day_number))
  const allDaysDone = vids.length > 0 && vids.every((v) => doneSet.has(v.day_number))
  const showTest = allDaysDone && trainingStatus !== 'completed'
  const trainingComplete = trainingStatus === 'completed'

  return (
    <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
      {data.note ? <p className="text-foreground/90">{data.note}</p> : null}
      <TrainingDaysBlock
        data={data}
        onSessionRefresh={onSessionRefresh}
        canEditTrainingContent={canEditTrainingContent}
        canBypassTrainingLocks={canBypassTrainingLocks}
      />
      {showTest ? (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-4">
          <p className="mb-1 text-sm font-semibold text-foreground">🎯 All 7 days done! Take the final test</p>
          <p className="mb-3 text-xs text-muted-foreground">Pass with 60% or above to unlock your certificate.</p>
          <TrainingCertificationBlock onSessionRefresh={onSessionRefresh} />
        </div>
      ) : null}
      {trainingComplete ? (
        <CertificateDownloadBlock />
      ) : null}
    </div>
  )
}
