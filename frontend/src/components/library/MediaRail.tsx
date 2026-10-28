import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

import { TRAINING_PATH } from '@/lib/media'
import { cn } from '@/lib/utils'

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

/** Thumbnail tile with a caption underneath: square, or 16:9 (`wide`) for video shelves. */
export function Tile({ to, href, thumb, icon, badge, done, caption, wide = false }: {
  to?: string
  href?: string
  thumb?: string | null
  icon: ReactNode
  badge?: string
  done?: boolean
  caption: string
  wide?: boolean
}) {
  const body = (
    <>
      <span
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden bg-card text-foreground/70',
          wide ? 'aspect-video' : 'aspect-square',
        )}
      >
        {thumb ? <img src={thumb} alt="" loading="lazy" className="size-full object-cover" /> : icon}
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
