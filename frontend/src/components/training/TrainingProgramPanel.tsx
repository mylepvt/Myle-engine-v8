import { useCallback, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import {
  useMarkTrainingDayMutation,
  useUpdateTrainingDayMutation,
  useUploadTrainingAudioMutation,
  useUploadTrainingNotesMutation,
  useUploadCertificateMutation,
} from '@/hooks/use-training-query'
import { apiFetch } from '@/lib/api'
import { authSyncIdentity } from '@/lib/auth-api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000'
  }
  return ''
}

function resolveUrl(url: string | undefined | null): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  return `${getApiBase()}${url}`
}

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
// Admin config panel (one day at a time)
// ---------------------------------------------------------------------------

function AdminDayConfig({ dayNumber }: { dayNumber: number }) {
  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLInputElement>(null)

  const updateDay = useUpdateTrainingDayMutation()
  const uploadAudio = useUploadTrainingAudioMutation()

  const save = async () => {
    setMsg(null)
    setErr(null)
    try {
      const payload: { title?: string; youtube_url?: string } = {}
      if (title.trim()) payload.title = title.trim()
      if (youtubeUrl.trim()) payload.youtube_url = youtubeUrl.trim()
      if (Object.keys(payload).length > 0) {
        await updateDay.mutateAsync({ dayNumber, payload })
      }
      if (audioFile) {
        await uploadAudio.mutateAsync({ dayNumber, file: audioFile })
        setAudioFile(null)
        if (audioRef.current) audioRef.current.value = ''
      }
      setMsg('Saved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold text-foreground/70">Day {dayNumber} — Admin config</p>
      <input
        className="field-input w-full text-xs"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="field-input w-full text-xs"
        placeholder="YouTube URL"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Audio (.mp3):</label>
        <input
          ref={audioRef}
          type="file"
          accept="audio/*"
          className="text-xs text-foreground"
          onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 text-xs"
        disabled={updateDay.isPending || uploadAudio.isPending}
        onClick={() => void save()}
      >
        {updateDay.isPending || uploadAudio.isPending ? 'Saving…' : 'Save'}
      </Button>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-day card
// ---------------------------------------------------------------------------

function DayCard({
  video,
  completed,
  hasNotes,
  onRefresh,
  isAdmin,
}: {
  video: { day_number: number; title: string; youtube_url?: string; audio_url?: string; unlocked?: boolean }
  completed: boolean
  hasNotes: boolean
  onRefresh: () => Promise<void>
  isAdmin: boolean
}) {
  const { day_number, title, youtube_url, audio_url, unlocked = true } = video
  // Admin/leader can access all days regardless of unlock state
  const effectivelyUnlocked = isAdmin || unlocked

  const [timerDone, setTimerDone] = useState(false)
  const [noteFile, setNoteFile] = useState<File | null>(null)
  const [noteErr, setNoteErr] = useState<string | null>(null)
  const [noteUploading, setNoteUploading] = useState(false)
  const [localHasNotes, setLocalHasNotes] = useState(hasNotes)
  const fileRef = useRef<HTMLInputElement>(null)

  const markDay = useMarkTrainingDayMutation()
  const uploadNotes = useUploadTrainingNotesMutation()

  // Start timer when video is embedded (best-effort 30s wait)
  const handleIframeLoad = useCallback(() => {
    const t = setTimeout(() => setTimerDone(true), 30_000)
    return () => clearTimeout(t)
  }, [])

  const handleNoteUpload = async () => {
    if (!noteFile) return
    setNoteErr(null)
    setNoteUploading(true)
    try {
      await uploadNotes.mutateAsync({ dayNumber: day_number, file: noteFile })
      setLocalHasNotes(true)
      setNoteFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setNoteUploading(false)
    }
  }

  const handleMarkComplete = async () => {
    try {
      await markDay.mutateAsync(day_number)
      await onRefresh()
    } catch (e) {
      // error shown inline via mutation state
    }
  }

  if (!effectivelyUnlocked) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 opacity-50">
        <div className="flex items-center gap-2">
          <span className="text-base">🔒</span>
          <span className="text-sm font-medium text-foreground">
            Day {day_number} — {title}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Complete Day {day_number - 1} first</p>
      </div>
    )
  }

  const embedUrl = youtube_url
    ? youtube_url.replace('watch?v=', 'embed/').split('&')[0] + '?enablejsapi=1'
    : null

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Day {day_number} — {title.replace(/^Day\s*\d+\s*[—–-]+\s*/i, '')}
        </span>
        {completed && (
          <span className="text-xs font-medium text-emerald-400">✓ Completed</span>
        )}
      </div>

      {/* 1. Video */}
      <div className="space-y-1">
        {embedUrl ? (
          <>
            <p className="text-xs text-muted-foreground">Watch video fully before proceeding</p>
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onLoad={handleIframeLoad}
                title={`Day ${day_number} video`}
              />
            </div>
            {!timerDone && (
              <p className="text-xs text-amber-400">Please spend at least 30 seconds watching before proceeding</p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Video not configured yet</p>
        )}
      </div>

      {/* 2. Audio */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/70">Listen to the audio</p>
        {resolveUrl(audio_url) ? (
          <audio controls src={resolveUrl(audio_url)!} className="w-full" />
        ) : (
          <p className="text-xs text-muted-foreground">Audio not configured yet</p>
        )}
      </div>

      {/* 3. Notes upload */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/70">Upload your notes</p>
        {localHasNotes ? (
          <p className="text-xs text-emerald-400">✓ Notes submitted</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="text-xs text-foreground"
              onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={!noteFile || noteUploading}
              onClick={() => void handleNoteUpload()}
            >
              {noteUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        )}
        {noteErr && <p className="text-xs text-destructive">{noteErr}</p>}
      </div>

      {/* 4. Mark complete */}
      {!completed && (
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            disabled={!localHasNotes || markDay.isPending}
            onClick={() => void handleMarkComplete()}
          >
            {markDay.isPending ? 'Saving…' : 'Mark complete'}
          </Button>
          {!localHasNotes && (
            <p className="text-xs text-muted-foreground">Upload your notes first to enable this button</p>
          )}
          {markDay.isError && (
            <p className="text-xs text-destructive">
              {markDay.error instanceof Error ? markDay.error.message : 'Could not save'}
            </p>
          )}
        </div>
      )}

      {/* Admin config */}
      {isAdmin && <AdminDayConfig dayNumber={day_number} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Training days block
// ---------------------------------------------------------------------------

function TrainingDaysBlock({
  data,
  onSessionRefresh,
  isAdmin,
}: {
  data: TrainingSurfacePayload
  onSessionRefresh: () => Promise<void>
  isAdmin: boolean
}) {
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const notes = Array.isArray((data as any).notes) ? (data as any).notes as { day_number: number }[] : []

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
          <DayCard
            key={v.day_number}
            video={v}
            completed={doneSet.has(v.day_number)}
            hasNotes={notesSet.has(v.day_number)}
            onRefresh={onSessionRefresh}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Certificate upload block — shown after all 7 days completed
// ---------------------------------------------------------------------------

function CertificateUploadBlock({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadMut = useUploadCertificateMutation()

  const handleUpload = async () => {
    if (!file) return
    setErr(null)
    try {
      await uploadMut.mutateAsync(file)
      setDone(true)
      await onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-4 text-center">
        <p className="text-base font-semibold text-emerald-400">🎉 Training Complete!</p>
        <p className="mt-1 text-xs text-muted-foreground">Your certificate has been submitted. Dashboard is now unlocking…</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">🏆 All 7 Days Complete!</p>
      <p className="text-xs text-muted-foreground">
        Upload your training certificate (photo/screenshot) to unlock the full dashboard.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="text-xs text-foreground"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="sm"
          disabled={!file || uploadMut.isPending}
          onClick={() => void handleUpload()}
        >
          {uploadMut.isPending ? 'Uploading…' : 'Submit Certificate'}
        </Button>
      </div>
      {err ? <p className="text-xs text-destructive" role="alert">{err}</p> : null}
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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

type Props = {
  data: TrainingSurfacePayload
}

export function TrainingProgramPanel({ data }: Props) {
  const qc = useQueryClient()
  const { data: me } = useAuthMeQuery()
  const role = me?.role ?? null

  const onSessionRefresh = useCallback(async () => {
    await authSyncIdentity()
    await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    await qc.invalidateQueries({ queryKey: ['system', 'training'] })
    await qc.invalidateQueries({ queryKey: ['other', 'training'] })
    await qc.invalidateQueries({ queryKey: ['training', 'surface'] })
  }, [qc])

  const isAdmin = role === 'admin' || role === 'leader'
  const trainingStatus = me?.training_status ?? ''

  // All 7 days marked done but certificate not yet uploaded
  const vids = Array.isArray(data.videos) ? data.videos : []
  const progress = Array.isArray(data.progress) ? data.progress : []
  const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.day_number))
  const allDaysDone = vids.length > 0 && vids.every((v) => doneSet.has(v.day_number))
  const needsCertificate = allDaysDone && trainingStatus !== 'completed'

  return (
    <div className="surface-elevated space-y-4 p-4 text-sm text-muted-foreground">
      {data.note ? <p className="text-foreground/90">{data.note}</p> : null}
      <TrainingDaysBlock data={data} onSessionRefresh={onSessionRefresh} isAdmin={isAdmin} />
      {needsCertificate ? (
        <CertificateUploadBlock onRefresh={onSessionRefresh} />
      ) : null}
      <TrainingCertificationBlock onSessionRefresh={onSessionRefresh} />
    </div>
  )
}
