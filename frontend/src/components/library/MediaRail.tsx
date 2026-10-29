import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Lock } from 'lucide-react'

import { TRAINING_PATH } from '@/lib/media'
import { topicFor } from '@/lib/topics'
import { cn } from '@/lib/utils'

/** Picture box for a tile: the topic's icon on a wash of its colour (a lock while locked). */
export function TopicArt({ topic, locked = false, iconClassName = 'size-9', className }: {
  topic: string
  locked?: boolean
  iconClassName?: string
  className?: string
}) {
  const { icon: Icon, tone } = topicFor(topic)
  return (
    <span className={cn('jw-topic relative flex items-center justify-center overflow-hidden', tone, className)}>
      {locked ? (
        <Lock className={cn(iconClassName, 'opacity-70')} strokeWidth={1.25} aria-hidden />
      ) : (
        <Icon className={iconClassName} strokeWidth={1.25} aria-hidden />
      )}
    </span>
  )
}

/** A titled row of tiles that scrolls sideways, edge to edge. */
export function Rail({ title, more, children }: { title: string; more?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-ds-h2 font-bold text-foreground">{title}</h2>
        {more ? (
          <Link to={more.to} className="text-sm text-primary hover:opacity-80">
            {more.label}
          </Link>
        ) : null}
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-[3px] overflow-x-auto px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">{children}</ul>
    </section>
  )
}

/** Topic tile with a caption underneath: square, or 16:9 (`wide`) for video shelves. */
export function Tile({ to, href, topic, locked, badge, done, caption, wide = false }: {
  to?: string
  href?: string
  topic: string
  locked?: boolean
  badge?: string
  done?: boolean
  caption: string
  wide?: boolean
}) {
  const body = (
    <>
      <span className="relative block w-full">
        <TopicArt topic={topic} locked={locked} className={cn('w-full', wide ? 'aspect-video' : 'aspect-square')} />
        {badge ? (
          <span className="absolute left-1 top-1 bg-black/70 px-1 text-ds-micro font-medium text-white">▶ {badge}</span>
        ) : null}
        {done ? <CheckCircle2 className="absolute bottom-1 right-1 size-4 text-success-ink" aria-label="Completed" /> : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-ds-caption leading-snug text-foreground">{caption}</span>
    </>
  )
  const cls = cn('press block shrink-0', wide ? 'w-[168px] md:w-[208px]' : 'w-[112px] md:w-[128px]')
  return (
    <li className="shrink-0">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link to={to ?? TRAINING_PATH} className={cls}>
          {body}
        </Link>
      )}
    </li>
  )
}
