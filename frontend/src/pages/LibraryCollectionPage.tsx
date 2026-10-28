import { Navigate, useParams } from 'react-router-dom'
import { Lock, PlayCircle, Video } from 'lucide-react'

import { Rail, Tile } from '@/components/library/MediaRail'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { useLibraryCollections } from '@/hooks/use-library-collections'

/** One Library video collection: a shelf of 16:9 tiles per section, like a video library. */
export function LibraryCollectionPage() {
  const { collection: id } = useParams()
  const { collections, isPending, error, refetch } = useLibraryCollections()

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-[3px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-[168px]" />
          ))}
        </div>
      </div>
    )
  }
  const collection = collections.find((c) => c.id === id)
  if (!collection) {
    if (error) return <ErrorState title="Could not load videos" message={error.message} onRetry={refetch} />
    return <Navigate to="/dashboard/library" replace />
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {collection.sections.length === 0 && collection.note ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          {collection.locked ? <Lock className="size-10" strokeWidth={1.25} aria-hidden /> : <PlayCircle className="size-10" strokeWidth={1.25} aria-hidden />}
          <p className="max-w-xs text-sm">{collection.note}</p>
        </div>
      ) : null}
      {collection.sections.map((section) => (
        <Rail key={section.title} title={section.title}>
          {section.items.map((item) => (
            <Tile
              key={item.key}
              wide
              to={item.to}
              href={item.href}
              thumb={item.thumb}
              icon={
                item.locked ? (
                  <Lock className="size-8" strokeWidth={1.25} />
                ) : item.href ? (
                  <Video className="size-9" strokeWidth={1.25} />
                ) : (
                  <PlayCircle className="size-9" strokeWidth={1.25} />
                )
              }
              badge={item.badge}
              done={item.done}
              caption={item.caption}
            />
          ))}
        </Rail>
      ))}
    </div>
  )
}
