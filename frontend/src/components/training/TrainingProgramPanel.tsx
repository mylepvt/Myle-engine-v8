import { Award, BookOpenCheck, ClipboardCheck, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'

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

function TrainingOverviewCard({
  totalDays,
  completedDays,
  showQuiz,
  trainingComplete,
}: {
  totalDays: number
  completedDays: number
  showQuiz: boolean
  trainingComplete: boolean
}) {
  const progressPercent = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0
  const remainingDays = Math.max(totalDays - completedDays, 0)

  let nextStep = 'Day 1'
  if (trainingComplete) nextStep = 'Certificate'
  else if (showQuiz) nextStep = 'Final quiz'
  else if (completedDays > 0) nextStep = `Day ${Math.min(completedDays + 1, totalDays)}`

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.08] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
            <Sparkles className="size-3.5" />
            Training
          </Badge>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Stay consistent. Finish one clear step at a time.
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Watch the lesson, play the audio, upload one clear notes photo, then mark the day as
              done. Each day unlocks the next step.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <div className="surface-inset inline-flex items-center gap-2 px-3 py-1.5">
              <BookOpenCheck className="size-3.5 text-primary" />
              <span>{totalDays} lessons</span>
            </div>
            <div className="surface-inset inline-flex items-center gap-2 px-3 py-1.5">
              <ClipboardCheck className="size-3.5 text-primary" />
              <span>Notes needed each day</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[25rem]">
          <div className="surface-inset px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Done</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{completedDays}</p>
          </div>
          <div className="surface-inset px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Left</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{remainingDays}</p>
          </div>
          <div className="surface-inset px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Next</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{nextStep}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/6">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function TrainingDaysBlock({
  data,
  onSessionRefresh,
  canEditTrainingContent,
  canBypassTrainingLocks,
  showQuiz,
  trainingComplete,
}: {
  data: TrainingSurfacePayload
  onSessionRefresh: () => Promise<void>
  canEditTrainingContent: boolean
  canBypassTrainingLocks: boolean
  showQuiz: boolean
  trainingComplete: boolean
}) {
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const notes = Array.isArray(data.notes) ? data.notes : []

  const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.day_number))
  const notesSet = new Set(notes.map((n) => n.day_number))
  const completedDays = vids.filter((v) => doneSet.has(v.day_number)).length

  if (vids.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-base font-medium text-foreground">Training is not available yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again later. If this keeps happening, contact support.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TrainingOverviewCard
        totalDays={vids.length}
        completedDays={completedDays}
        showQuiz={showQuiz}
        trainingComplete={trainingComplete}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Your 7-day plan</p>
        <p className="text-sm text-muted-foreground">
          One day at a time: watch the lesson, play the audio, add a clear photo of your notes, then
          mark that day as done.
        </p>
      </div>

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
            {canEditTrainingContent ? <TrainingDayAdmin video={v} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function CertificateDownloadBlock() {
  const downloadMut = useDownloadCertificateMutation()
  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.12] to-transparent px-5 py-5 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300">
        <Award className="size-5" />
      </div>
      <p className="mt-3 text-base font-semibold text-foreground">You're done with training</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Download your certificate. Your name is added for you.
      </p>
      <Button
        type="button"
        className="mt-4"
        disabled={downloadMut.isPending}
        onClick={() => downloadMut.mutate()}
      >
        {downloadMut.isPending ? 'Preparing...' : 'Download certificate'}
      </Button>
      {downloadMut.isError && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          Could not download. Check your connection and try again.
        </p>
      )}
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
        const options =
          o.options && typeof o.options === 'object' ? (o.options as Record<string, string>) : {}
        if (!Number.isFinite(id) || !question) continue
        cleaned.push({ id, question, options })
      }
      setQuestions(cleaned)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the quiz. Please try again.')
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
      setErr(e instanceof Error ? e.message : 'Could not submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Final quiz</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Answer all questions, then submit once.
          </p>
        </div>
        {questions === null ? (
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? 'Opening...' : 'Start quiz'}
          </Button>
        ) : null}
      </div>

      {questions !== null && questions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The quiz is not ready yet. Please check back soon.
        </p>
      ) : null}

      {questions ? (
        <div className="mt-4 space-y-3">
          {questions.map((q, index) => (
            <fieldset key={q.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <legend className="flex items-start gap-2 text-sm font-medium text-foreground">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5">{q.question}</span>
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(['a', 'b', 'c', 'd'] as const).map((letter) => {
                  const selected = answers[q.id] === letter
                  return (
                    <label
                      key={letter}
                      className={cn(
                        'flex min-h-[48px] cursor-pointer items-start gap-2 rounded-xl border px-3 py-3 text-sm transition-colors',
                        selected
                          ? 'border-primary/40 bg-primary/[0.08] text-foreground'
                          : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-primary/20 hover:text-foreground',
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        className="mt-0.5 accent-primary"
                        checked={selected}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: letter }))}
                      />
                      <span className="min-w-0">
                        <span className="mr-1 font-semibold text-foreground">{letter.toUpperCase()}.</span>
                        {q.options[letter] ?? '-'}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <Button type="button" className="w-full sm:w-auto" disabled={loading} onClick={() => void submit()}>
            {loading ? 'Submitting...' : 'Submit quiz'}
          </Button>
        </div>
      ) : null}

      {err ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {result ? (
        <div
          className={cn(
            'mt-4 rounded-xl border px-4 py-4',
            result.passed
              ? 'border-emerald-400/20 bg-emerald-400/[0.08]'
              : 'border-amber-400/20 bg-amber-400/[0.08]',
          )}
        >
          <p className="text-sm text-foreground">
            You scored {result.score} out of {result.total_questions} ({result.percent}%).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.passed
              ? 'You passed. Your certificate is ready below.'
              : `You need ${result.pass_mark_percent}% to pass. Try again when you are ready.`}
          </p>
          {result.passed && result.training_completed ? (
            <div className="mt-4">
              <CertificateDownloadBlock />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

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

  const canEditTrainingContent = serverRole === 'admin'
  const canBypassTrainingLocks = serverRole === 'admin' && !isAdminPreviewing

  const trainingStatus = me?.training_status ?? ''
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.day_number))
  const allDaysDone = vids.length > 0 && vids.every((v) => doneSet.has(v.day_number))
  const showTest = allDaysDone && trainingStatus !== 'completed'
  const trainingComplete = trainingStatus === 'completed'

  return (
    <div className="surface-elevated space-y-5 p-4 text-sm text-muted-foreground md:p-5">
      {data.note ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-foreground/90">
          {data.note}
        </div>
      ) : null}

      <TrainingDaysBlock
        data={data}
        onSessionRefresh={onSessionRefresh}
        canEditTrainingContent={canEditTrainingContent}
        canBypassTrainingLocks={canBypassTrainingLocks}
        showQuiz={showTest}
        trainingComplete={trainingComplete}
      />

      {showTest ? (
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-transparent px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.08] p-3 text-primary">
              <ClipboardCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">All 7 days are complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Take the short quiz next. You need at least 60% to unlock your certificate.
              </p>
            </div>
          </div>
          <TrainingCertificationBlock onSessionRefresh={onSessionRefresh} />
        </div>
      ) : null}

      {trainingComplete ? <CertificateDownloadBlock /> : null}
    </div>
  )
}
