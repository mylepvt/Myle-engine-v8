import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, GraduationCap, Megaphone, PlayCircle, Video } from 'lucide-react'

import { CONTENT_VIDEO_LABELS } from '@/config/content-links'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useContentLinksQuery } from '@/hooks/use-content-links-query'
import { getDownloadFileUrl, useDownloadsQuery } from '@/hooks/use-downloads-query'
import { useNoticeBoardQuery } from '@/hooks/use-notice-board-query'
import { useSkillsTrainingQuery, type SkillLesson } from '@/hooks/use-skills-training-query'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { extractYouTubeId } from '@/lib/youtube'

const TRAINING = '/dashboard/system/training'

function thumbFor(url: string | null | undefined): string | null {
  const id = url ? extractYouTubeId(url) : null
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}

/** "Day 3 · Prospecting", unless the title already names its day. */
function dayCaption(day: number, title: string): string {
  return /^day\s*\d/i.test(title.trim()) ? title : `Day ${day} · ${title}`
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function Rail({ title, more, children }: { title: string; more?: { to: string; label: string }; children: ReactNode }) {
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

/** Square thumbnail tile with a caption underneath. */
function Tile({ to, href, thumb, icon, badge, done, caption }: {
  to?: string
  href?: string
  thumb?: string | null
  icon: ReactNode
  badge?: string
  done?: boolean
  caption: string
}) {
  const body = (
    <>
      <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-card text-foreground/70">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="size-full object-cover" /> : icon}
        {badge ? (
          <span className="absolute left-1 top-1 bg-black/70 px-1 text-ds-micro font-medium text-white">▶ {badge}</span>
        ) : null}
        {done ? <CheckCircle2 className="absolute bottom-1 right-1 size-4 text-success-ink" aria-label="Completed" /> : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-ds-caption leading-snug text-foreground">{caption}</span>
    </>
  )
  const cls = 'press block w-[112px] shrink-0 md:w-[128px]'
  return (
    <li className="shrink-0">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link to={to ?? TRAINING} className={cls}>
          {body}
        </Link>
      )}
    </li>
  )
}

/** Wide card: thumbnail on the left, kind / title / meta on the right. */
function NewsCard({ to, href, icon, kind, title, meta }: {
  to?: string
  href?: string
  icon: ReactNode
  kind: string
  title: string
  meta: string
}) {
  const body = (
    <>
      <span className="flex w-24 shrink-0 items-center justify-center bg-muted text-foreground/70">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col justify-between p-2.5">
        <span className="min-w-0">
          <span className="block truncate text-ds-caption text-muted-foreground">{kind}</span>
          <span className="line-clamp-2 text-sm leading-snug text-foreground">{title}</span>
        </span>
        <span className="block truncate text-ds-caption text-muted-foreground">{meta}</span>
      </span>
    </>
  )
  const cls = 'jw-row press flex h-28 w-[300px] shrink-0 overflow-hidden'
  return (
    <li className="shrink-0">
      {href ? (
        <a href={href} className={cls}>
          {body}
        </a>
      ) : (
        <Link to={to ?? '/dashboard'} className={cls}>
          {body}
        </Link>
      )}
    </li>
  )
}

/**
 * The learning half of Home, laid out like a content library: Continue Learning,
 * Teaching Toolbox (lessons, prospect videos, documents) and What's New (latest
 * documents and notices). Every item comes from existing data; empty rails hide.
 */
export function HomeLearningSections() {
  const { data: me } = useAuthMeQuery()
  const skills = useSkillsTrainingQuery()
  const onboarding = useTrainingQuery()
  const downloads = useDownloadsQuery()
  const notices = useNoticeBoardQuery()
  const canSeeLinks = me?.role === 'admin' || me?.role === 'leader'
  const contentLinks = useContentLinksQuery()

  // Continue Learning: the next onboarding day, else the next lesson.
  const doneDays = new Set(onboarding.data?.progress.filter((p) => p.completed).map((p) => p.day_number))
  const nextDay = onboarding.data?.videos
    .filter((v) => v.unlocked !== false && !doneDays.has(v.day_number))
    .sort((a, b) => a.day_number - b.day_number)[0]
  const allLessons: SkillLesson[] = skills.data
    ? [skills.data.personal_development, ...skills.data.academy.categories].flatMap((c) => c.lessons)
    : []
  const nextLesson = allLessons.find((l) => l.id === skills.data?.next_lesson_id)

  const academyLessons = skills.data?.available ? skills.data.academy.categories.flatMap((c) => c.lessons) : []
  const days = [...(onboarding.data?.videos ?? [])].sort((a, b) => a.day_number - b.day_number)
  const links = canSeeLinks
    ? CONTENT_VIDEO_LABELS.flatMap(({ key, label }) => {
        const url = contentLinks.data?.[key]
        return url ? [{ key, label, url }] : []
      })
    : []
  const docs = (downloads.data ?? []).filter((d) => d.available)

  const news = [
    ...docs.map((d) => ({ at: d.created_at, key: `d${d.id}`, kind: 'Publication', title: d.title, href: getDownloadFileUrl(d.id), icon: <FileText className="size-8" strokeWidth={1.25} /> })),
    ...(notices.data?.items ?? []).map((n) => ({ at: n.created_at, key: `n${n.id}`, kind: 'Notice', title: n.message || 'Voice note', to: '/dashboard/other/notice-board', icon: <Megaphone className="size-8" strokeWidth={1.25} /> })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10)

  return (
    <div className="mb-8 space-y-8">
      {nextDay || nextLesson ? (
        <Rail title="Continue Learning">
          {nextDay ? (
            <Tile thumb={thumbFor(nextDay.youtube_url)} icon={<GraduationCap className="size-9" strokeWidth={1.25} />} caption={dayCaption(nextDay.day_number, nextDay.title)} />
          ) : null}
          {nextLesson ? (
            <Tile
              to={`${TRAINING}?lesson=${nextLesson.id}`}
              thumb={thumbFor(nextLesson.youtube_url)}
              icon={<PlayCircle className="size-9" strokeWidth={1.25} />}
              badge={nextLesson.duration_minutes ? `${nextLesson.duration_minutes} min` : undefined}
              caption={nextLesson.title}
            />
          ) : null}
        </Rail>
      ) : null}

      {academyLessons.length > 0 || days.length > 0 ? (
        <Rail title="Teaching Toolbox" more={{ to: '/dashboard/library', label: 'See all' }}>
          {academyLessons.length > 0
            ? academyLessons.map((l) => (
                <Tile
                  key={l.id}
                  to={`${TRAINING}?lesson=${l.id}`}
                  thumb={thumbFor(l.youtube_url)}
                  icon={<PlayCircle className="size-9" strokeWidth={1.25} />}
                  badge={l.duration_minutes ? `${l.duration_minutes} min` : undefined}
                  done={l.completed}
                  caption={l.title}
                />
              ))
            : days.map((v) => (
                <Tile
                  key={v.day_number}
                  thumb={v.unlocked === false ? null : thumbFor(v.youtube_url)}
                  icon={<GraduationCap className="size-9" strokeWidth={1.25} />}
                  done={doneDays.has(v.day_number)}
                  caption={dayCaption(v.day_number, v.title)}
                />
              ))}
        </Rail>
      ) : null}

      {links.length > 0 || docs.length > 0 ? (
        <Rail title="Share with Prospects" more={{ to: '/dashboard/library?tab=publications', label: 'Publications' }}>
          {links.map((l) => (
            <Tile key={l.key} href={l.url} thumb={thumbFor(l.url)} icon={<Video className="size-9" strokeWidth={1.25} />} caption={l.label} />
          ))}
          {docs.map((d) => (
            <Tile key={d.id} href={getDownloadFileUrl(d.id)} icon={<FileText className="size-9" strokeWidth={1.25} />} caption={d.title} />
          ))}
        </Rail>
      ) : null}

      {news.length > 0 ? (
        <Rail title="What's New">
          {news.map((n) => (
            <NewsCard key={n.key} to={'to' in n ? n.to : undefined} href={'href' in n ? n.href : undefined} icon={n.icon} kind={n.kind} title={n.title} meta={ago(n.at)} />
          ))}
        </Rail>
      ) : null}
    </div>
  )
}
