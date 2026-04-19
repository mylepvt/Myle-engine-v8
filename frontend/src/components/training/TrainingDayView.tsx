import { CheckCircle2, CirclePlay, FileImage, Headphones, Lock } from 'lucide-react'
import { useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import { useMarkTrainingDayMutation, useUploadTrainingNotesMutation } from '@/hooks/use-training-query'

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

type Props = {
  video: TrainingSurfacePayload['videos'][number]
  completed: boolean
  hasNotes: boolean
  onRefresh: () => Promise<void>
  /** True when real admin (not preview-as) — unlocks all days for QA. */
  canBypassTrainingLocks: boolean
}

/**
 * Read-only training day surface for leader / team / admin preview-as.
 * No title/URL/save controls — those live only in TrainingDayAdmin.
 */
export function TrainingDayView({
  video,
  completed,
  hasNotes,
  onRefresh,
  canBypassTrainingLocks,
}: Props) {
  const { day_number, title, youtube_url, audio_url, unlocked = true } = video
  const effectivelyUnlocked = canBypassTrainingLocks || unlocked
  const cleanTitle = title.replace(/^Day\s*\d+\s*[—–-]+\s*/i, '')

  const [timerDone, setTimerDone] = useState(false)
  const [noteFile, setNoteFile] = useState<File | null>(null)
  const [noteErr, setNoteErr] = useState<string | null>(null)
  const [noteUploading, setNoteUploading] = useState(false)
  const [localHasNotes, setLocalHasNotes] = useState(hasNotes)
  const fileRef = useRef<HTMLInputElement>(null)

  const markDay = useMarkTrainingDayMutation()
  const uploadNotes = useUploadTrainingNotesMutation()

  const handleIframeLoad = () => {
    window.setTimeout(() => setTimerDone(true), 30_000)
  }

  const handleNoteUpload = async () => {
    if (!noteFile) return
    setNoteErr(null)
    setNoteUploading(true)
    try {
      await uploadNotes.mutateAsync({ dayNumber: day_number, file: noteFile })
      setLocalHasNotes(true)
      setNoteFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setNoteErr('Upload did not work. Please try again.')
    } finally {
      setNoteUploading(false)
    }
  }

  const handleMarkComplete = async () => {
    try {
      await markDay.mutateAsync(day_number)
      await onRefresh()
    } catch {
      // mutation surfaces error state
    }
  }

  if (!effectivelyUnlocked) {
    return (
      <div className="surface-inset flex items-start gap-3 border-white/10 bg-white/[0.03] px-4 py-4 opacity-80">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-muted-foreground">
          <Lock className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-foreground">
              Day {day_number}
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-muted-foreground">
              Locked
            </Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{cleanTitle || title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This lesson opens after the previous day is finished.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Finish day {day_number - 1} first - then this day opens.
          </p>
        </div>
      </div>
    )
  }

  const embedUrl = youtube_url
    ? youtube_url.replace('watch?v=', 'embed/').split('&')[0] + '?enablejsapi=1'
    : null

  return (
    <div className="surface-inset overflow-hidden border-white/10 bg-white/[0.04] px-4 py-4 md:px-5 md:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-foreground">
              Day {day_number}
            </Badge>
            {completed ? <Badge variant="success">Done</Badge> : <Badge variant="primary">In progress</Badge>}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight text-foreground">{cleanTitle || title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Finish the lesson, audio and notes for this day.
            </p>
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
          One day at a time
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.95fr)]">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <CirclePlay className="size-4 text-primary" />
            <span>Watch</span>
          </div>
          {embedUrl ? (
            <>
              <div className="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black">
                <iframe
                  src={embedUrl}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onLoad={handleIframeLoad}
                  title={`Day ${day_number} video`}
                />
              </div>
              {!timerDone ? (
                <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-300">
                  Stay on this video for at least 30 seconds to continue.
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Video step done. Continue below.</p>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
              Video will appear here when it is ready.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Headphones className="size-4 text-primary" />
              <span>Listen</span>
            </div>
            {resolveUrl(audio_url) ? (
              <audio controls src={resolveUrl(audio_url)!} className="w-full max-w-full" />
            ) : (
              <p className="text-sm text-muted-foreground">Audio is not ready yet.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <FileImage className="size-4 text-primary" />
              <span>Your notes</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Upload one clear photo of your notes for this day.
            </p>
            {localHasNotes ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="size-4" />
                <span>Notes received</span>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
                  onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={!noteFile || noteUploading}
                  onClick={() => void handleNoteUpload()}
                >
                  {noteUploading ? 'Sending...' : 'Upload photo'}
                </Button>
              </div>
            )}
            {noteErr && <p className="mt-2 text-xs text-destructive">{noteErr}</p>}
          </div>

          {completed ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 text-emerald-300" />
                <div>
                  <p className="text-sm font-medium text-foreground">Day complete</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can continue with the next unlocked day.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-medium text-foreground">Finish this day</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mark this day as done after your notes photo is uploaded.
              </p>
              <Button
                type="button"
                className="mt-3 w-full"
                disabled={!localHasNotes || markDay.isPending}
                onClick={() => void handleMarkComplete()}
              >
                {markDay.isPending ? 'Saving...' : 'Mark day as done'}
              </Button>
              {!localHasNotes && (
                <p className="mt-2 text-xs text-muted-foreground">Upload a photo of your notes first.</p>
              )}
              {markDay.isError && (
                <p className="mt-2 text-xs text-destructive">Could not save. Please try again.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
