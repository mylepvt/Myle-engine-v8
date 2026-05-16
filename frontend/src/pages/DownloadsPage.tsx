import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  getDownloadFileUrl,
  useDownloadsMutations,
  useDownloadsQuery,
  type DownloadItem,
} from '@/hooks/use-downloads-query'
import { useAppSettingsQuery } from '@/hooks/use-settings-query'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { cn } from '@/lib/utils'
import { Download, ExternalLink, FileText, Trash2, Upload } from 'lucide-react'

type Props = { title: string }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

const ICON_BY_TYPE: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'video/mp4': 'MP4',
  'application/zip': 'ZIP',
}

function FileTypeBadge({ mime }: { mime: string }) {
  const label = ICON_BY_TYPE[mime] ?? 'FILE'
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[10px] font-bold tracking-wide text-primary">
      {label}
    </span>
  )
}

const MINDSET_LOCK_LINKS: Array<{ key: string; label: string }> = [
  { key: 'content.esbi_model', label: 'ESBI Model Video' },
  { key: 'content.power_of_network', label: 'Power of Network Video' },
]

const DAY_EXTRA_LINKS: Record<number, Array<{ key: string; label: string }>> = {
  2: [{ key: 'content.manik_expose', label: 'Expose Video (Manik Aggarwal)' }],
}

export function DownloadsPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const isLeader = me?.authenticated && me.role === 'leader'
  const showLinks = isAdmin || isLeader

  const { data: trainingData } = useTrainingQuery()
  const { data: appSettingsData } = useAppSettingsQuery(showLinks)

  const { data, isPending, isError, error, refetch } = useDownloadsQuery()
  const { upload, remove } = useDownloadsMutations()

  const fileRef = useRef<HTMLInputElement>(null)
  const [fileTitle, setFileTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setSelectedFile(f)
    if (f && !fileTitle.trim()) {
      setFileTitle(f.name.replace(/\.[^.]+$/, ''))
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!selectedFile) {
      setFormError('Select a file to upload.')
      return
    }
    const t = fileTitle.trim()
    if (!t) {
      setFormError('Title is required.')
      return
    }
    try {
      await upload.mutateAsync({ file: selectedFile, title: t, description: description.trim() })
      setFileTitle('')
      setDescription('')
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  function handleDownload(item: DownloadItem) {
    const a = document.createElement('a')
    a.href = getDownloadFileUrl(item.id)
    a.download = item.filename
    a.click()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-ds-h1">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Download documents shared by admin.
      </p>

      {showLinks ? (
        <div className="surface-elevated space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ExternalLink className="h-4 w-4" /> Video Links
          </h2>

          {/* Mindset Lock */}
          {MINDSET_LOCK_LINKS.some(({ key }) => appSettingsData?.settings[key]) ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mindset Lock</p>
              <ul className="space-y-1.5 text-sm">
                {MINDSET_LOCK_LINKS.map(({ key, label }) => {
                  const url = appSettingsData?.settings[key]
                  if (!url) return null
                  return (
                    <li key={key} className="flex items-center gap-3">
                      <span className="flex h-7 w-14 shrink-0 items-center justify-center rounded bg-fuchsia-500/15 text-[10px] font-bold tracking-wide text-fuchsia-400">
                        ML
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 rounded border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">
                        Open
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {/* Day 2 – Day 6 */}
          {[2, 3, 4, 5, 6].map((dayNum) => {
            const video = trainingData?.videos.find((v) => v.day_number === dayNum)
            const extras = DAY_EXTRA_LINKS[dayNum] ?? []
            const extraItems = extras.filter(({ key }) => appSettingsData?.settings[key])
            if (!video?.youtube_url && extraItems.length === 0) return null
            return (
              <div key={dayNum} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Day {dayNum}{video?.title ? ` — ${video.title}` : ''}
                </p>
                <ul className="space-y-1.5 text-sm">
                  {video?.youtube_url ? (
                    <li className="flex items-center gap-3">
                      <span className="flex h-7 w-14 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-bold tracking-wide text-primary">
                        Video
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">Training Video</span>
                      <a href={video.youtube_url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 rounded border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">
                        Open
                      </a>
                    </li>
                  ) : null}
                  {extraItems.map(({ key, label }) => (
                    <li key={key} className="flex items-center gap-3">
                      <span className="flex h-7 w-14 shrink-0 items-center justify-center rounded bg-amber-500/15 text-[10px] font-bold tracking-wide text-amber-400">
                        Link
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
                      <a href={appSettingsData!.settings[key]} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 rounded border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}

      {isAdmin ? (
        <form
          onSubmit={(e) => void handleUpload(e)}
          className="surface-elevated space-y-3 p-5 text-sm"
        >
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <Upload className="h-4 w-4" /> Upload document
          </h2>

          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            disabled={upload.isPending}
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
          />

          <input
            type="text"
            value={fileTitle}
            onChange={(e) => setFileTitle(e.target.value)}
            disabled={upload.isPending}
            placeholder="Document title"
            className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={upload.isPending}
            rows={2}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
          />

          {formError ? (
            <p className="text-sm text-destructive" role="alert">{formError}</p>
          ) : null}

          <Button type="submit" disabled={upload.isPending || !selectedFile}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {data.length} document{data.length === 1 ? '' : 's'}
          </p>
          {data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-40" />
              <p className="text-sm">No documents uploaded yet.</p>
            </div>
          ) : null}
          <ul className="space-y-2">
            {data.map((row) => (
              <li
                key={row.id}
                className="surface-elevated flex items-center gap-3 rounded border border-border/60 p-4 text-sm"
              >
                <FileTypeBadge mime={row.mime_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{row.title}</p>
                  {row.description ? (
                    <p className="truncate text-xs text-muted-foreground">{row.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatSize(row.file_size)} · {formatWhen(row.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDownload(row)}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  {isAdmin ? (
                    deleteConfirmId === row.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Sure?</span>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={remove.isPending}
                          onClick={() => {
                            void remove.mutateAsync(row.id).finally(() => setDeleteConfirmId(null))
                          }}
                        >
                          Yes
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn('text-destructive hover:bg-destructive/10')}
                        disabled={remove.isPending}
                        onClick={() => setDeleteConfirmId(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
