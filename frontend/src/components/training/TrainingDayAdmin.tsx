import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useUpdateTrainingDayMutation, useUploadTrainingAudioMutation } from '@/hooks/use-training-query'

type Props = { dayNumber: number }

/**
 * Training day editor — must only be mounted when the authenticated user is an admin
 * (not “view as” preview). Parent is responsible for conditional rendering.
 */
export function TrainingDayAdmin({ dayNumber }: Props) {
  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
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
      const payload: { title?: string; youtube_url?: string; audio_url?: string } = {}
      if (title.trim()) payload.title = title.trim()
      if (youtubeUrl.trim()) payload.youtube_url = youtubeUrl.trim()
      if (audioUrl.trim()) payload.audio_url = audioUrl.trim()
      if (Object.keys(payload).length > 0) {
        await updateDay.mutateAsync({ dayNumber, payload })
      }
      if (audioFile) {
        await uploadAudio.mutateAsync({ dayNumber, file: audioFile })
        setAudioFile(null)
        if (audioRef.current) audioRef.current.value = ''
      }
      setMsg('Saved ✓')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3 min-w-0">
      <p className="text-xs font-semibold text-amber-400/80">Admin — Day {dayNumber} content</p>
      <input
        className="field-input w-full min-w-0 max-w-full text-xs"
        placeholder="Day title (e.g. Day 1 — Welcome & Orientation)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="field-input w-full min-w-0 max-w-full text-xs"
        placeholder="YouTube video URL"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
      />
      <input
        className="field-input w-full min-w-0 max-w-full text-xs"
        placeholder="Audio URL (paste link — or upload file below)"
        value={audioUrl}
        onChange={(e) => setAudioUrl(e.target.value)}
      />
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="shrink-0 text-xs text-muted-foreground">Upload audio file</span>
        <input
          ref={audioRef}
          type="file"
          accept="audio/*"
          className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
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
