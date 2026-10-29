import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, Headphones, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { getDownloadFileUrl, useDownloadsMutations, useDownloadsQuery, type DownloadItem } from '@/hooks/use-downloads-query'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { apiUrl } from '@/lib/api'
import { isAudioDownload } from '@/lib/topics'
import { cn } from '@/lib/utils'

const AUDIO_ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,audio/*'
const rowClass = 'press flex min-h-16 min-w-0 items-center gap-4 bg-transparent px-4 py-3 text-left'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-ds-h2 font-bold text-foreground">{title}</h2>
      <ul className="grid grid-cols-1 gap-[3px] lg:grid-cols-2">{children}</ul>
    </section>
  )
}

/** One playable row: tap to open the player under it. */
function Track({ title, meta, src, open, onToggle, trailing }: {
  title: string
  meta?: string
  src: string
  open: boolean
  onToggle: () => void
  trailing?: ReactNode
}) {
  return (
    <li className="jw-row">
      <div className="flex items-center">
        <button type="button" className={cn(rowClass, 'flex-1')} onClick={onToggle} aria-expanded={open}>
          <span className="jw-topic jw-tone-cyan flex size-10 shrink-0 items-center justify-center">
            <Headphones className="size-6" strokeWidth={1.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ds-body text-foreground">{title}</span>
            {meta ? <span className="block truncate text-ds-caption text-muted-foreground">{meta}</span> : null}
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {trailing}
      </div>
      {open ? <audio className="w-full px-4 pb-3" src={src} controls autoPlay preload="none" /> : null}
    </li>
  )
}

function UploadForm() {
  const { upload } = useDownloadsMutations()
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file || !title.trim()) return
    try {
      await upload.mutateAsync({ file, title: title.trim(), description: '' })
      setTitle('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      /* error shown below */
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="jw-row space-y-3 p-4">
      <p className="text-ds-body font-semibold text-foreground">Upload audio</p>
      <div>
        <label htmlFor="audio-title" className="field-label">
          Title
        </label>
        <Input id="audio-title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning mindset talk" />
      </div>
      <div>
        <label htmlFor="audio-file" className="field-label">
          Audio file (mp3, m4a, aac, wav, ogg · max 50 MB)
        </label>
        <input
          ref={fileRef}
          id="audio-file"
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
        />
      </div>
      {upload.isError ? <p className="text-sm text-destructive-ink">{upload.error.message}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={upload.isPending || !file || !title.trim()}>
          <Upload />
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
    </form>
  )
}

/** Library › Audio: admin-uploaded audio (stored like any download) and the onboarding day audio. */
export function LibraryAudio() {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.role === 'admin'
  const downloads = useDownloadsQuery()
  const onboarding = useTrainingQuery()
  const { remove } = useDownloadsMutations()
  const [open, setOpen] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<DownloadItem | null>(null)

  if (downloads.isPending || onboarding.isPending) {
    return (
      <div className="space-y-[3px]" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }
  if (downloads.isError && onboarding.isError) {
    return <ErrorState title="Could not load audio" message={downloads.error.message} onRetry={() => void downloads.refetch()} />
  }

  const uploaded = (downloads.data ?? []).filter((d) => isAudioDownload(d) && d.available)
  const days = (onboarding.data?.videos ?? [])
    .filter((v) => v.audio_url && v.unlocked !== false)
    .sort((a, b) => a.day_number - b.day_number)
  const toggle = (key: string) => setOpen(open === key ? null : key)

  return (
    <div className="space-y-8">
      {isAdmin ? <UploadForm /> : null}

      {uploaded.length > 0 ? (
        <Shelf title="Audio">
          {uploaded.map((d) => (
            <Track
              key={d.id}
              title={d.title}
              meta={formatSize(d.file_size)}
              src={getDownloadFileUrl(d.id)}
              open={open === `d${d.id}`}
              onToggle={() => toggle(`d${d.id}`)}
              trailing={
                isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setToDelete(d)}
                    className="press mr-2 flex size-10 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive-ink"
                    aria-label={`Delete ${d.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : undefined
              }
            />
          ))}
        </Shelf>
      ) : null}

      {days.length > 0 ? (
        <Shelf title="Onboarding audio">
          {days.map((v) => (
            <Track
              key={v.day_number}
              title={v.title}
              meta={`Day ${v.day_number}`}
              src={v.audio_url!.startsWith('http') ? v.audio_url! : apiUrl(v.audio_url!)}
              open={open === `t${v.day_number}`}
              onToggle={() => toggle(`t${v.day_number}`)}
            />
          ))}
        </Shelf>
      ) : null}

      {uploaded.length === 0 && days.length === 0 && !isAdmin ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <Headphones className="size-10" strokeWidth={1.25} aria-hidden />
          <p className="max-w-xs text-sm">No audio yet.</p>
        </div>
      ) : null}

      <ConfirmDialog
        open={toDelete != null}
        title="Delete this audio?"
        description={toDelete ? `"${toDelete.title}" will be removed for everyone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id)
          setToDelete(null)
          setOpen(null)
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
