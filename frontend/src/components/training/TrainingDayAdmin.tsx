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
      setMsg('Saved')
    } catch {
      setErr('Could not save. Check the links and file, then try again.')
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] via-transparent to-transparent p-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/90">Admin editor</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Update day {dayNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Change the title, video and audio shown to learners.
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
        </label>

        <label className="block">
          <span className="field-label">Audio link</span>
          <input
            className="field-input w-full min-w-0 max-w-full text-sm"
            placeholder="Optional if you upload a file"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Audio file</span>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <input
              ref={audioRef}
              type="file"
              accept="audio/*"
              className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
          </div>
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
