import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  CloudUpload,
  Headphones,
  NotebookPen,
  Video,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'
import { apiUrl } from '@/lib/api'
import { buildBatchGreetingCopy } from '@/lib/batch-watch'
import { buildEmbeddableVideoUrl, resolveYouTubeWatchUrl } from '@/lib/youtube'

type BatchWatchData = {
  token: string
  slot: string
  version: number
  day_number: number
  slot_label: string
  title: string
  subtitle: string
  lead_name: string
  access_open: boolean
  opens_at: string | null
  gate_message: string | null
  youtube_url: string | null
  video_id: string | null
  watch_complete: boolean
  day2_evaluation_ready: boolean
  submission_enabled: boolean
  submission: BatchWatchSubmission | null
}

type BatchWatchSubmission = {
  notes_url: string | null
  voice_note_url: string | null
  video_url: string | null
  notes_text: string | null
  submitted_at: string | null
}

function toAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  return apiUrl(url)
}

async function readJsonError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail
  }
  return res.statusText || `HTTP ${res.status}`
}

function UploadCard({
  icon,
  title,
  accept,
  hint,
  file,
  onChange,
}: {
  icon: ReactNode
  title: string
  accept: string
  hint: string
  file: File | null
  onChange: (file: File | null) => void
}) {
  return (
    <label className="rounded-[1.5rem] border border-white/10 bg-muted/40 p-4 text-left transition hover:border-cyan-300/20 hover:bg-muted/60">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-white/10 bg-muted/60 p-2 text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-ds-caption text-white/55">{hint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/72">
              <CloudUpload className="size-3.5" />
              Choose file
            </span>
            <span className="min-w-0 truncate text-xs text-white/55">
              {file ? file.name : 'Nothing selected yet'}
            </span>
          </div>
        </div>
      </div>
      <input
        key={file?.name ?? 'empty'}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  )
}

function formatGateTime(value: string | null): string {
  if (!value) return 'your scheduled batch time'
  return new Date(value).toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  })
}

export function BatchWatchPage() {
  const { slot, version } = useParams<{ slot: string; version: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [data, setData] = useState<BatchWatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completionBusy, setCompletionBusy] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [submissionBusy, setSubmissionBusy] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)

  const [notesFile, setNotesFile] = useState<File | null>(null)
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [notesText, setNotesText] = useState('')

  const isDay6 = slot?.startsWith('d6_') ?? false
  const [nowMs, setNowMs] = useState(() => Date.now())

  const loadPayload = async () => {
    if (!slot || !version || !token) return
    const res = await fetch(apiUrl(`/api/v1/watch/batch/${slot}/${version}/payload?token=${encodeURIComponent(token)}`))
    if (!res.ok) throw new Error(await readJsonError(res))
    const payload = (await res.json()) as BatchWatchData
    setData(payload)
  }

  useEffect(() => {
    if (!slot || !version || !token) {
      setError('This batch link is incomplete. Please use the latest link.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    void loadPayload()
      .then(() => {
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not open this batch page.')
        setLoading(false)
      })
  }, [slot, token, version])

  // Heartbeat every 20s so admin Premiere tab shows live viewers
  useEffect(() => {
    if (!slot || !token) return
    const beat = () => {
      void fetch(apiUrl('/api/v1/watch/batch/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot }),
      }).catch(() => undefined)
    }
    beat()
    const id = setInterval(beat, 20_000)
    return () => clearInterval(id)
  }, [slot, token])

  // 1-second ticker for waiting room countdown
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const playerEmbedUrl = useMemo(
    () => buildEmbeddableVideoUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id),
    [data?.video_id, data?.youtube_url],
  )
  const playerExternalUrl = useMemo(
    () => resolveYouTubeWatchUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id) ?? toAbsoluteUrl(data?.youtube_url),
    [data?.video_id, data?.youtube_url],
  )

  const watchComplete = !!data?.watch_complete
  const accessOpen = data?.access_open !== false
  const submission = data?.submission

  const opensAtMs = data?.opens_at ? new Date(data.opens_at).getTime() : null
  const msUntilOpen = opensAtMs != null ? Math.max(0, opensAtMs - nowMs) : null
  const startingSoon = msUntilOpen != null && msUntilOpen <= 15 * 60 * 1000
  const countdownLabel = (() => {
    if (msUntilOpen == null || msUntilOpen <= 0) return null
    const totalSec = Math.ceil(msUntilOpen / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  const handleMarkComplete = async () => {
    if (!slot || !token || completionBusy) return
    setCompletionBusy(true)
    setCompletionError(null)
    try {
      const res = await fetch(apiUrl('/api/v1/watch/batch/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot }),
      })
      if (!res.ok) throw new Error(await readJsonError(res))
      await loadPayload()
    } catch (err) {
      setCompletionError(err instanceof Error ? err.message : 'Could not update watch status.')
    } finally {
      setCompletionBusy(false)
    }
  }

  const handleSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!slot || !token) return

    const text = notesText.trim()
    if (!text && !notesFile && !voiceFile && !videoFile) {
      setSubmissionError('Notes, voice note, ya video me se kuch to upload kariye.')
      return
    }

    setSubmissionBusy(true)
    setSubmissionError(null)
    setSubmissionMessage(null)

    try {
      const form = new FormData()
      if (text) form.append('notes_text', text)
      if (notesFile) form.append('notes_file', notesFile)
      if (voiceFile) form.append('voice_file', voiceFile)
      if (videoFile) form.append('video_file', videoFile)

      const res = await fetch(
        apiUrl(`/api/v1/watch/batch/${slot}/submission?token=${encodeURIComponent(token)}`),
        {
          method: 'POST',
          body: form,
        },
      )
      if (!res.ok) throw new Error(await readJsonError(res))
      const nextSubmission = (await res.json()) as BatchWatchSubmission

      setData((current) => (current ? { ...current, submission: nextSubmission } : current))
      setSubmissionMessage('Upload received. Team isi batch ke against isse dekh sakti hai.')
      setNotesFile(null)
      setVoiceFile(null)
      setVideoFile(null)
      setNotesText('')
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Could not submit right now.')
    } finally {
      setSubmissionBusy(false)
    }
  }
  const greetingCopy = data
    ? buildBatchGreetingCopy({
        leadName: data.lead_name,
        dayNumber: data.day_number,
        slot: data.slot,
        slotLabel: data.slot_label,
      })
    : null
  const noteUrl = toAbsoluteUrl(submission?.notes_url)
  const voiceUrl = toAbsoluteUrl(submission?.voice_note_url)
  const submittedVideoUrl = toAbsoluteUrl(submission?.video_url)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#040915] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[4rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/16 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(8,15,30,0.72),rgba(3,6,13,0.96))]" />
      </div>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-56 bg-white/10" />
            <Skeleton className="aspect-video w-full rounded-2xl bg-white/10" />
            <Skeleton className="h-10 w-full rounded-2xl bg-white/10" />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-red-400/20 bg-red-500/[0.08] px-6 py-8 text-center">
            <p className="text-base font-semibold text-white">This batch room could not be opened.</p>
            <p className="mt-2 text-sm text-white/70">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Title — short, video stays the hero */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Day {data.day_number}</Badge>
              <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                {data.slot_label}
              </Badge>
              {!isDay6 && (
                <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                  Video {data.version}
                </Badge>
              )}
              {watchComplete ? <Badge variant="success">Watch tracked</Badge> : <Badge variant="warning">Playing now</Badge>}
            </div>
            <h1 className="text-xl font-semibold leading-tight text-white sm:text-2xl">
              {greetingCopy?.heroTitle ?? `${data.slot_label} batch ready for ${data.lead_name}.`}
            </h1>

            {/* Video first — old-app style, shown immediately */}
            {accessOpen ? (
              <InAppVideoPlayer
                embedUrl={playerEmbedUrl}
                title={data.title}
                fallbackUrl={playerExternalUrl}
                previewEyebrow={`Day ${data.day_number} · ${data.slot_label}`}
                previewTitle={data.title}
                previewDescription="Tap play to watch this video inside Myle."
                playLabel="Play video"
                seekPrevention
              />
            ) : (
              <div className={`rounded-2xl border px-5 py-6 text-left transition-colors ${startingSoon ? 'border-emerald-400/30 bg-emerald-400/[0.07]' : 'border-amber-300/20 bg-amber-400/[0.08]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm font-semibold uppercase tracking-[0.24em] ${startingSoon ? 'text-emerald-300/80' : 'text-amber-200/80'}`}>
                    {startingSoon ? 'Starting soon' : 'Scheduled access'}
                  </p>
                  {countdownLabel && (
                    <p className={`font-mono text-3xl font-bold tabular-nums ${startingSoon ? 'text-emerald-300' : 'text-white'}`}>
                      {countdownLabel}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {startingSoon ? 'Session is about to begin!' : 'This room is locked for now'}
                </p>
                <p className="mt-3 text-ds-body text-white/72">
                  {startingSoon
                    ? 'Stay on this page — the video will unlock automatically when the session starts.'
                    : (data.gate_message ?? 'Please open this room only at your scheduled batch time.')}
                </p>
                {!startingSoon && (
                  <p className="mt-3 text-sm text-amber-100">
                    Opens at {formatGateTime(data.opens_at)}
                  </p>
                )}
              </div>
            )}

            {/* Confirm watched */}
            {accessOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/55">Video play me issue ho to screen par play tap kariye.</p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={completionBusy || watchComplete}
                  onClick={() => void handleMarkComplete()}
                >
                  {watchComplete ? 'Watch tracked' : completionBusy ? 'Saving...' : 'I watched this'}
                </Button>
              </div>
            ) : null}

            {completionError ? (
              <p className="text-sm text-red-300">{completionError}</p>
            ) : watchComplete ? (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <p>{greetingCopy?.completionMessage ?? 'Batch watched ho gaya. Apne coach ko ✅ reply karke confirm kar dijiye.'}</p>
              </div>
            ) : accessOpen ? (
              <p className="text-center text-sm text-white/60">Finished watching? Message your coach and reply ✅ to confirm.</p>
            ) : null}

              {data.submission_enabled ? (
                <section className="order-3 rounded-[2rem] border border-white/10 bg-muted/50 p-5 backdrop-blur-xl md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">Post-batch upload</Badge>
                    <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                      Notes + voice + video + message
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Upload after this batch</h2>
                      <p className="mt-2 max-w-2xl text-ds-body text-white/62">
                        Is batch ke baad notes, voice note, practice video, ya short message isi page se bhej sakte ho.
                      </p>
                    </div>
                    {submission?.submitted_at ? (
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-2 text-xs text-emerald-100">
                        Last uploaded {new Date(submission.submitted_at).toLocaleString()}
                      </div>
                    ) : null}
                  </div>

                  {(noteUrl || voiceUrl || submittedVideoUrl || submission?.notes_text) && (
                    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-semibold text-white">Latest upload for this batch</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <a
                          href={noteUrl ?? undefined}
                          target={noteUrl ? '_blank' : undefined}
                          rel="noreferrer"
                          className={`rounded-[1.25rem] border px-4 py-3 text-left ${
                            noteUrl
                              ? 'border-cyan-300/20 bg-cyan-300/[0.08] text-white'
                              : 'border-white/10 bg-muted/30 text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <NotebookPen className="size-4" />
                            Notes
                          </div>
                          <p className="mt-2 text-ds-caption">
                            {noteUrl ? 'Open uploaded notes' : 'No notes uploaded yet'}
                          </p>
                        </a>
                        <a
                          href={voiceUrl ?? undefined}
                          target={voiceUrl ? '_blank' : undefined}
                          rel="noreferrer"
                          className={`rounded-[1.25rem] border px-4 py-3 text-left ${
                            voiceUrl
                              ? 'border-cyan-300/20 bg-cyan-300/[0.08] text-white'
                              : 'border-white/10 bg-muted/30 text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Headphones className="size-4" />
                            Voice note
                          </div>
                          <p className="mt-2 text-ds-caption">
                            {voiceUrl ? 'Play uploaded voice note' : 'No voice note uploaded yet'}
                          </p>
                        </a>
                        <a
                          href={submittedVideoUrl ?? undefined}
                          target={submittedVideoUrl ? '_blank' : undefined}
                          rel="noreferrer"
                          className={`rounded-[1.25rem] border px-4 py-3 text-left ${
                            submittedVideoUrl
                              ? 'border-cyan-300/20 bg-cyan-300/[0.08] text-white'
                              : 'border-white/10 bg-muted/30 text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Video className="size-4" />
                            Practice video
                          </div>
                          <p className="mt-2 text-ds-caption">
                            {submittedVideoUrl ? 'Open uploaded video' : 'No practice video uploaded yet'}
                          </p>
                        </a>
                      </div>
                      {submission?.notes_text ? (
                        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-muted/40 px-4 py-3 text-sm text-white/72">
                          {submission.notes_text}
                        </div>
                      ) : null}
                    </div>
                  )}

                  <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmission(event)}>
                    <div className="grid gap-4 md:grid-cols-3">
                      <UploadCard
                        icon={<NotebookPen className="size-4" />}
                        title="Notes"
                        accept="image/*,.pdf"
                        hint="Photo ya PDF dono chalega."
                        file={notesFile}
                        onChange={setNotesFile}
                      />
                      <UploadCard
                        icon={<Headphones className="size-4" />}
                        title="Voice note"
                        accept="audio/*,.m4a,.mp3,.ogg,.wav,.webm"
                        hint="Short explanation ya reflection upload kijiye."
                        file={voiceFile}
                        onChange={setVoiceFile}
                      />
                      <UploadCard
                        icon={<Video className="size-4" />}
                        title="Practice video"
                        accept="video/*,.mp4,.mov,.webm,.m4v"
                        hint="Short demo ya response video record karke bhejiye."
                        file={videoFile}
                        onChange={setVideoFile}
                      />
                    </div>

                    <label className="block">
                      <span className="text-sm font-medium text-white">Message</span>
                      <textarea
                        rows={4}
                        value={notesText}
                        onChange={(event) => setNotesText(event.target.value)}
                        placeholder="Short update, summary, ya question likh sakte ho..."
                        className="mt-2 w-full rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/30 focus:ring-2 focus:ring-cyan-300/15"
                      />
                    </label>

                    {submissionError ? <p className="text-sm text-red-300">{submissionError}</p> : null}
                    {submissionMessage ? <p className="text-sm text-emerald-200">{submissionMessage}</p> : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
                      <p className="text-sm text-white/62">
                        {greetingCopy?.mentorLine ??
                          'Team ko is batch ka upload clean way me mil jayega aur final test step alag rahega.'}
                      </p>
                      <Button type="submit" disabled={submissionBusy}>
                        {submissionBusy ? 'Uploading...' : 'Upload to team'}
                      </Button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
        ) : null}
      </main>
    </div>
  )
}
