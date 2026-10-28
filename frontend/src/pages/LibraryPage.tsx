import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronRight,
  CloudOff,
  FileText,
  GraduationCap,
  Headphones,
  Lock,
  Settings2,
} from 'lucide-react'

import { TopicArt } from '@/components/library/MediaRail'
import { ErrorState } from '@/components/ui/states'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { getDownloadFileUrl, useDownloadsQuery, type DownloadItem } from '@/hooks/use-downloads-query'
import { useLibraryCollections } from '@/hooks/use-library-collections'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { apiUrl } from '@/lib/api'
import { documentTopicKey } from '@/lib/topics'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'publications', label: 'Publications' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'downloaded', label: 'Downloaded' },
] as const
type TabId = (typeof TABS)[number]['id']

const rowClass = 'jw-row flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-ds-h2 font-bold text-foreground">{title}</h2>
      <ul className="grid grid-cols-1 gap-[3px] lg:grid-cols-2">{children}</ul>
    </section>
  )
}

function RowBody({ icon, title, meta, trailing }: { icon: ReactNode; title: string; meta?: string; trailing?: ReactNode }) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center text-foreground/85">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ds-body text-foreground">{title}</span>
        {meta ? <span className="block truncate text-ds-caption text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing ?? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
      {icon}
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  )
}

function Loading() {
  return (
    <div className="space-y-[3px]" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

function Publications() {
  const { data, isPending, isError, error, refetch } = useDownloadsQuery()
  if (isPending) return <Loading />
  if (isError) return <ErrorState title="Could not load publications" message={error.message} onRetry={() => void refetch()} />
  if (data.length === 0) return <Empty icon={<FileText className="size-10" strokeWidth={1.25} />} text="No publications have been added yet." />

  const open = (item: DownloadItem) => {
    const a = document.createElement('a')
    a.href = getDownloadFileUrl(item.id)
    a.download = item.filename
    a.click()
  }
  return (
    <section className="space-y-3">
      <h2 className="text-ds-h2 font-bold text-foreground">Documents</h2>
      <ul className="grid grid-cols-3 gap-x-[3px] gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
        {data.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="press block w-full text-left disabled:opacity-50"
              disabled={!item.available}
              onClick={() => open(item)}
            >
              <TopicArt topic={documentTopicKey(item)} className="aspect-[3/4] w-full" />
              <span className="mt-1.5 line-clamp-2 text-ds-caption leading-snug text-foreground">{item.title}</span>
              <span className="block truncate text-ds-micro text-muted-foreground">
                {item.available ? formatSize(item.file_size) : 'File missing'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Video tab: one wide banner tile per collection — name on the left, its topic art fading in on the right. */
function VideoCollections() {
  const { collections, isPending, error, refetch } = useLibraryCollections()
  if (isPending) return <Loading />
  if (error && collections.length === 0) return <ErrorState title="Could not load videos" message={error.message} onRetry={refetch} />

  return (
    <ul className="grid grid-cols-1 gap-[3px] sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((c) => {
        const items = c.sections.flatMap((s) => s.items)
        const done = items.filter((i) => i.done).length
        const meta = c.note ?? (items.length > 0 ? `${items.length} videos${done ? ` · ${done} done` : ''}` : undefined)
        return (
          <li key={c.id}>
            <Link to={`/dashboard/library/${c.id}`} className="jw-row press relative flex h-24 items-center overflow-hidden md:h-28">
              <span className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-center">
                <TopicArt topic={c.topic} iconClassName="size-14" className="size-full" />
                <span className="jw-fade-left absolute inset-0" aria-hidden />
              </span>
              <span className="relative z-10 min-w-0 max-w-[65%] px-4">
                <span className="flex items-center gap-1.5 text-ds-h3 font-semibold text-foreground">
                  {c.locked ? <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                  <span className="truncate">{c.title}</span>
                </span>
                {meta ? <span className="block truncate text-ds-caption text-muted-foreground">{meta}</span> : null}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Audio() {
  const { data, isPending, isError, error, refetch } = useTrainingQuery()
  const [playing, setPlaying] = useState<number | null>(null)
  if (isPending) return <Loading />
  if (isError) return <ErrorState title="Could not load audio" message={error.message} onRetry={() => void refetch()} />
  const tracks = data.videos.filter((v) => v.audio_url && v.unlocked !== false).sort((a, b) => a.day_number - b.day_number)
  if (tracks.length === 0) return <Empty icon={<Headphones className="size-10" strokeWidth={1.25} />} text="No audio lessons yet." />

  return (
    <Section title="Onboarding audio">
      {tracks.map((v) => {
        const src = v.audio_url!.startsWith('http') ? v.audio_url! : apiUrl(v.audio_url!)
        return (
          <li key={v.day_number} className="jw-row">
            <button type="button" className={cn(rowClass, 'press bg-transparent')} onClick={() => setPlaying(playing === v.day_number ? null : v.day_number)}>
              <RowBody icon={<Headphones className="size-7" strokeWidth={1.25} />} title={v.title} meta={`Day ${v.day_number}`} />
            </button>
            {playing === v.day_number ? (
              <audio className="w-full px-4 pb-3" src={src} controls autoPlay preload="none" />
            ) : null}
          </li>
        )
      })}
    </Section>
  )
}

/** Library tab: learning content by type, like a publications library. */
export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const { role } = useDashboardShellRole()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'video'

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div role="tablist" aria-label="Library" className="no-scrollbar -mx-4 mb-6 flex overflow-x-auto border-b border-border px-2 md:-mx-6 lg:-mx-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn(
              'shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-ds-caption uppercase tracking-wide',
              t.id === tab ? 'border-primary font-bold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'publications' ? <Publications /> : null}
      {tab === 'video' ? <VideoCollections /> : null}
      {tab === 'audio' ? <Audio /> : null}
      {tab === 'downloaded' ? (
        <Empty
          icon={<CloudOff className="size-10" strokeWidth={1.25} />}
          text="Saving for offline isn't available yet. Open documents from Publications."
        />
      ) : null}

      {role === 'admin' ? (
        <div className="mt-10">
          <Section title="Manage">
            <li>
              <Link to="/dashboard/other/downloads" className={cn(rowClass, 'press')}>
                <RowBody icon={<Settings2 className="size-7" strokeWidth={1.25} />} title="Upload publications" />
              </Link>
            </li>
            <li>
              <Link to="/dashboard/system/training-progress" className={cn(rowClass, 'press')}>
                <RowBody icon={<GraduationCap className="size-7" strokeWidth={1.25} />} title="Training progress" />
              </Link>
            </li>
          </Section>
        </div>
      ) : null}
    </div>
  )
}
