import { useRef, useState } from 'react'

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
 * No title/URL/save controls — those live only in {@link TrainingDayAdmin}.
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
    } catch {
      // mutation surfaces error state
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
    <div className="min-w-0 space-y-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          Day {day_number} — {title.replace(/^Day\s*\d+\s*[—–-]+\s*/i, '')}
        </span>
        {completed && <span className="text-xs font-medium text-emerald-400">✓ Completed</span>}
      </div>

      <div className="space-y-1">
        {embedUrl ? (
          <>
            <p className="text-xs text-muted-foreground">Watch video fully before proceeding</p>
            <div className="aspect-video w-full max-w-full overflow-hidden rounded-md bg-black">
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
          <p className="text-xs text-muted-foreground">Content will be available soon</p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/70">Listen to the audio</p>
        {resolveUrl(audio_url) ? (
          <audio controls src={resolveUrl(audio_url)!} className="w-full max-w-full" />
        ) : (
          <p className="text-xs text-muted-foreground">Content will be available soon</p>
        )}
      </div>

      <div className="space-y-1 min-w-0">
        <p className="text-xs font-medium text-foreground/70">Upload your notes</p>
        {localHasNotes ? (
          <p className="text-xs text-emerald-400">✓ Notes submitted</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
              onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 w-full shrink-0 text-xs sm:w-auto"
              disabled={!noteFile || noteUploading}
              onClick={() => void handleNoteUpload()}
            >
              {noteUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        )}
        {noteErr && <p className="text-xs text-destructive">{noteErr}</p>}
      </div>

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
    </div>
  )
}
