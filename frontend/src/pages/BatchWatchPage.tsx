import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  CloudUpload,
  Headphones,
  NotebookPen,
  PlayCircle,
  ShieldCheck,
  Video,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'
import { WatchLiveGauge } from '@/components/watch/WatchLiveGauge'
import { apiUrl } from '@/lib/api'
import { buildBatchGreetingCopy } from '@/lib/batch-watch'
import { buildEmbeddableVideoUrl, resolveYouTubeWatchUrl } from '@/lib/youtube'

type BatchWatchSubmission = {
  notes_url: string | null
  voice_note_url: string | null
  video_url: string | null
  notes_text: string | null
  submitted_at: string | null
}

type BatchWatchData = {
  token: string
  slot: string
  version: number
  day_number: number
  slot_label: string
  title: string
  subtitle: string
  lead_name: string
  youtube_url: string | null
  video_id: string | null
  watch_complete: boolean
  submission_enabled: boolean
  submission: BatchWatchSubmission | null
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
    <label className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/20 hover:bg-white/[0.06]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">{hint}</p>
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

  useEffect(() => {
    if (!slot || !version || !token) {
      setError('This batch link is incomplete. Please use the latest link.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    void fetch(apiUrl(`/api/v1/watch/batch/${slot}/${version}/payload?token=${encodeURIComponent(token)}`))
      .then(async (res) => {
        if (!res.ok) throw new Error(await readJsonError(res))
        return res.json() as Promise<BatchWatchData>
      })
      .then((payload) => {
        setData(payload)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not open this batch page.')
        setLoading(false)
      })
  }, [slot, token, version])

  const playerEmbedUrl = useMemo(
    () => buildEmbeddableVideoUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id),
    [data?.video_id, data?.youtube_url],
  )
  const playerExternalUrl = useMemo(
    () => resolveYouTubeWatchUrl(toAbsoluteUrl(data?.youtube_url), data?.video_id) ?? toAbsoluteUrl(data?.youtube_url),
    [data?.video_id, data?.youtube_url],
  )

  const watchComplete = !!data?.watch_complete
  const submission = data?.submission

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
      setData((current) => (current ? { ...current, watch_complete: true } : current))
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
      setSubmissionMessage('Submission received. Team can review it from here onward.')
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

  const noteUrl = toAbsoluteUrl(submission?.notes_url)
  const voiceUrl = toAbsoluteUrl(submission?.voice_note_url)
  const submittedVideoUrl = toAbsoluteUrl(submission?.video_url)
  const greetingCopy = data
    ? buildBatchGreetingCopy({
        leadName: data.lead_name,
        dayNumber: data.day_number,
        slot: data.slot,
        slotLabel: data.slot_label,
      })
    : null

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#040915] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[4rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/16 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[26rem] w-[30rem] -translate-x-1/2 rounded-full bg-emerald-300/8 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(8,15,30,0.72),rgba(3,6,13,0.96))]" />
      </div>

      <header className="relative border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Myle Experience</p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-white">Batch Watch Room</p>
          </div>
          <Badge variant="outline" className="border-white/15 bg-white/[0.05] text-white/70">
            Trusted in-app playback
          </Badge>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {loading ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
            <div className="space-y-6">
              <Skeleton className="h-12 w-72 bg-white/10" />
              <Skeleton className="h-[28rem] w-full rounded-[2rem] bg-white/10" />
              <Skeleton className="h-44 w-full rounded-[2rem] bg-white/10" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-[2rem] bg-white/10" />
              <Skeleton className="h-40 w-full rounded-[2rem] bg-white/10" />
            </div>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-red-400/20 bg-red-500/[0.08] px-6 py-8 text-center">
            <p className="text-base font-semibold text-white">This batch room could not be opened.</p>
            <p className="mt-2 text-sm text-white/70">{error}</p>
          </div>
        ) : data ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_22rem]">
            <div className="flex flex-col gap-6">
              <section className="order-1 rounded-[2rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl md:p-5 lg:order-2">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">In-app player</p>
                    <p className="mt-1 text-sm text-white/60">
                      Video stays inside the Myle experience instead of kicking you out to YouTube.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={completionBusy || watchComplete}
                    onClick={() => void handleMarkComplete()}
                  >
                    {watchComplete ? 'Watch tracked' : completionBusy ? 'Saving...' : 'I watched this'}
                  </Button>
                </div>

                <InAppVideoPlayer
                  embedUrl={playerEmbedUrl}
                  title={data.title}
                  fallbackUrl={playerExternalUrl}
                  previewEyebrow="Batch player primed"
                  previewTitle={data.title}
                  previewDescription="Tap play to start the batch inside Myle without showing raw YouTube UI before the session begins."
                  playLabel="Start batch now"
                />

                {completionError ? (
                  <p className="mt-3 text-sm text-red-300">{completionError}</p>
                ) : watchComplete ? (
                  <div className="mt-4 flex items-start gap-3 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    <p>{greetingCopy?.completionMessage ?? 'This batch was marked watched successfully. You can continue from this same room.'}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-white/58">
                    Video starting me issue ho to screen par play tap kariye. Button fallback bhi diya hua hai.
                  </p>
                )}
              </section>

              <section className="order-2 rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_80px_-38px_rgba(34,211,238,0.55)] backdrop-blur-xl md:p-7 lg:order-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">Day {data.day_number}</Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-white/75">
                    {data.slot_label}
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-white/75">
                    Video {data.version}
                  </Badge>
                  {greetingCopy ? (
                    <Badge variant="outline" className="border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100">
                      {greetingCopy.reservedBadge}
                    </Badge>
                  ) : null}
                  {watchComplete ? <Badge variant="success">Watch tracked</Badge> : <Badge variant="warning">Playing now</Badge>}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
                  <div className="hidden rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:block">
                    <WatchLiveGauge />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">
                        {greetingCopy?.greetingLine ?? 'Personal batch room'}
                      </p>
                      <h1 className="mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl md:text-[2.6rem]">
                        {greetingCopy?.heroTitle ?? `${data.slot_label} batch ready for ${data.lead_name}.`}
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 md:text-base">
                        {greetingCopy?.heroSubtitle ?? data.subtitle}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Playback</p>
                        <p className="mt-2 text-sm font-semibold text-white">Inside Myle</p>
                      </div>
                      <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Batch</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {greetingCopy?.privateRoomBadge ?? data.title}
                        </p>
                      </div>
                      <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Trust Layer</p>
                        <p className="mt-2 text-sm font-semibold text-white">Private room</p>
                      </div>
                    </div>

                    {greetingCopy ? (
                      <div className="rounded-[1.5rem] border border-cyan-300/12 bg-cyan-300/[0.06] px-4 py-4">
                        <p className="text-sm font-semibold text-white">{greetingCopy.focusLine}</p>
                        <p className="mt-1 text-sm text-white/62">{greetingCopy.trustLine}</p>
                      </div>
                    ) : null}

                    <div className="rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/68 sm:hidden">
                      Scroll down for your full batch flow and submission wall.
                    </div>
                  </div>
                </div>
              </section>

              {data.submission_enabled ? (
                <section className="order-3 rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">Day 2 Submission</Badge>
                    <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-white/75">
                      Notes + voice + video
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Submit your work right here</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/62">
                        {greetingCopy?.submissionLine ??
                          'Day 2 ke liye apne handwritten notes, voice explanation, ya short practice video isi page se upload kijiye. Team ko sab kuch same room me mil jayega.'}
                      </p>
                    </div>
                    {submission?.submitted_at ? (
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-2 text-xs text-emerald-100">
                        Last submitted {new Date(submission.submitted_at).toLocaleString()}
                      </div>
                    ) : null}
                  </div>

                  {(noteUrl || voiceUrl || submittedVideoUrl || submission?.notes_text) && (
                    <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-semibold text-white">Latest submission</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <a
                          href={noteUrl ?? undefined}
                          target={noteUrl ? '_blank' : undefined}
                          rel="noreferrer"
                          className={`rounded-[1.25rem] border px-4 py-3 text-left ${
                            noteUrl
                              ? 'border-cyan-300/20 bg-cyan-300/[0.08] text-white'
                              : 'border-white/10 bg-white/[0.03] text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <NotebookPen className="size-4" />
                            Notes
                          </div>
                          <p className="mt-2 text-xs leading-relaxed">
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
                              : 'border-white/10 bg-white/[0.03] text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Headphones className="size-4" />
                            Voice note
                          </div>
                          <p className="mt-2 text-xs leading-relaxed">
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
                              : 'border-white/10 bg-white/[0.03] text-white/42'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Video className="size-4" />
                            Practice video
                          </div>
                          <p className="mt-2 text-xs leading-relaxed">
                            {submittedVideoUrl ? 'Open uploaded video' : 'No practice video uploaded yet'}
                          </p>
                        </a>
                      </div>
                      {submission?.notes_text ? (
                        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/72">
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
                      <span className="text-sm font-medium text-white">Message for mentor</span>
                      <textarea
                        rows={4}
                        value={notesText}
                        onChange={(event) => setNotesText(event.target.value)}
                        placeholder="Agar chahein to short update ya question bhi likh sakte hain..."
                        className="mt-2 w-full rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/30 focus:ring-2 focus:ring-cyan-300/15"
                      />
                    </label>

                    {submissionError ? <p className="text-sm text-red-300">{submissionError}</p> : null}
                    {submissionMessage ? <p className="text-sm text-emerald-200">{submissionMessage}</p> : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4">
                      <p className="text-sm text-white/62">
                        {greetingCopy?.mentorLine ??
                          'Team ko clean submission milegi aur aapko baar-baar app se bahar nahi jana padega.'}
                      </p>
                      <Button type="submit" disabled={submissionBusy}>
                        {submissionBusy ? 'Submitting...' : 'Submit to team'}
                      </Button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-200">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Trust-forward room</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/58">
                      {greetingCopy?.trustLine ??
                        'Premium layout, same-domain playback, and direct submission in one branded experience.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                <p className="text-sm font-semibold text-white">What happens here</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">1. Watch</p>
                    <p className="mt-2 text-sm text-white/78">
                      {greetingCopy?.focusLine ?? 'Batch video stays inside Myle.'}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">2. Confirm</p>
                    <p className="mt-2 text-sm text-white/78">Status is tracked without opening YouTube separately.</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">3. Submit</p>
                    <p className="mt-2 text-sm text-white/78">
                      {greetingCopy?.mentorLine ??
                        'Day 2 par notes, voice note, aur video isi screen se deliver ho jata hai.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <PlayCircle className="size-4 text-cyan-200" />
                  Batch signals
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Playback state</p>
                    <p className="mt-2 text-sm text-white">{watchComplete ? 'Watched in app' : 'Watching now'}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Submission wall</p>
                    <p className="mt-2 text-sm text-white">
                      {data.submission_enabled ? 'Unlocked on this batch' : 'Unlocks on Day 2'}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/45">Batch focus</p>
                    <p className="mt-2 text-sm text-white">{data.slot_label} attention block</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  )
}
