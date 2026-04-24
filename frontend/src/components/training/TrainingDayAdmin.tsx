import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import { useUpdateTrainingDayMutation, useUploadTrainingAudioMutation } from '@/hooks/use-training-query'

type Props = {
  video: TrainingSurfacePayload['videos'][number]
}

function normalizeValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Training day editor — mounted only for real admins. It can stay visible even when
 * admin is previewing another role so content fixes remain accessible.
 */
export function TrainingDayAdmin({ video }: Props) {
  const dayNumber = video.day_number
  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const audioRef = useRef<HTMLInputElement>(null)

  const updateDay = useUpdateTrainingDayMutation()
  const uploadAudio = useUploadTrainingAudioMutation()

  const currentTitle = normalizeValue(video.title)
  const currentYoutubeUrl = normalizeValue(video.youtube_url)
  const currentAudioUrl = normalizeValue(video.audio_url)

  useEffect(() => {
    setTitle(video.title)
    setYoutubeUrl(currentYoutubeUrl)
    setAudioUrl(currentAudioUrl)
    setAudioFile(null)
    setMsg(null)
    setErr(null)
    if (audioRef.current) audioRef.current.value = ''
  }, [dayNumber, video.title, currentYoutubeUrl, currentAudioUrl])

  const save = async () => {
    setMsg(null)
    setErr(null)
    try {
      const payload: { title?: string; youtube_url?: string; audio_url?: string } = {}
      const nextTitle = title.trim()
      const nextYoutubeUrl = youtubeUrl.trim()
      const nextAudioUrl = audioUrl.trim()

      if (nextTitle && nextTitle !== currentTitle) payload.title = nextTitle
      if (nextYoutubeUrl !== currentYoutubeUrl) payload.youtube_url = nextYoutubeUrl
      if (nextAudioUrl !== currentAudioUrl) payload.audio_url = nextAudioUrl

      if (!audioFile && Object.keys(payload).length === 0) {
        setMsg('No changes to save')
        return
      }
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
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setErr(`Save failed: ${msg}`)
    }
  }

  const clearVideo = async () => {
    setMsg(null)
    setErr(null)
    try {
      await updateDay.mutateAsync({ dayNumber, payload: { youtube_url: '' } })
      setYoutubeUrl('')
      setMsg('Video removed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setErr(`Remove failed: ${msg}`)
    }
  }

  const clearAudio = async () => {
    setMsg(null)
    setErr(null)
    try {
      await updateDay.mutateAsync({ dayNumber, payload: { audio_url: '' } })
      setAudioUrl('')
      setAudioFile(null)
      if (audioRef.current) audioRef.current.value = ''
      setMsg('Audio removed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setErr(`Remove failed: ${msg}`)
    }
  }

  return (
    <div className="mt-3 min-w-0 overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] via-transparent to-transparent p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/90">Admin editor</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Update day {dayNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit the current title, swap media links, or remove media that should no longer show.
          </p>
        </div>
        {msg ? (
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-xs text-emerald-300">
            {msg}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="field-label">Day title</span>
          <input
            className="field-input w-full min-w-0 max-w-full text-sm"
            placeholder="Day title shown to learners"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="field-label">Video link</span>
          <input
            className="field-input w-full min-w-0 max-w-full text-sm"
            placeholder="Paste a YouTube link"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{currentYoutubeUrl ? 'Video linked right now' : 'No video linked yet'}</span>
            {currentYoutubeUrl ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void clearVideo()}>
                Remove video
              </Button>
            ) : null}
          </div>
        </label>

        <label className="block">
          <span className="field-label">Audio link</span>
          <input
            className="field-input w-full min-w-0 max-w-full text-sm"
            placeholder="Optional if you upload a file"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{currentAudioUrl ? 'Audio linked right now' : 'No audio linked yet'}</span>
            {currentAudioUrl ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void clearAudio()}>
                Remove audio
              </Button>
            ) : null}
          </div>
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Audio file</span>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <input
              ref={audioRef}
              type="file"
              accept=".aac,.m4a,.mp3,.ogg,.wav,.webm,audio/*"
              className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            `.m4a`, `.mp3`, `.wav`, `.ogg` and similar audio files are supported.
          </p>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-h-[20px] text-xs">
          {err ? <p className="text-destructive">{err}</p> : <p className="text-muted-foreground">Save when you are ready.</p>}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full md:w-auto"
          disabled={updateDay.isPending || uploadAudio.isPending}
          onClick={() => void save()}
        >
          {updateDay.isPending || uploadAudio.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
