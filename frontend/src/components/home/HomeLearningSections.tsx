import { Link } from 'react-router-dom'

import { Rail, Tile, TopicArt } from '@/components/library/MediaRail'
import { CONTENT_VIDEO_LABELS } from '@/config/content-links'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useContentLinksQuery } from '@/hooks/use-content-links-query'
import { getDownloadFileUrl, useDownloadsQuery } from '@/hooks/use-downloads-query'
import { useNoticeBoardQuery } from '@/hooks/use-notice-board-query'
import { useSkillsTrainingQuery } from '@/hooks/use-skills-training-query'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { TRAINING_PATH as TRAINING, dayCaption } from '@/lib/media'
import { documentTopicKey } from '@/lib/topics'

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** Wide card: topic art on the left, kind / title / meta on the right. */
function NewsCard({ to, href, topic, kind, title, meta }: {
  to?: string
  href?: string
  topic: string
  kind: string
  title: string
  meta: string
}) {
  const body = (
    <>
      <TopicArt topic={topic} iconClassName="size-8" className="w-24 shrink-0" />
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
  // Lessons keep their category key: it picks each tile's topic icon and colour.
  const allLessons = skills.data
    ? [skills.data.personal_development, ...skills.data.academy.categories].flatMap((c) =>
        c.lessons.map((lesson) => ({ ...lesson, topic: c.key })),
      )
    : []
  const nextLesson = allLessons.find((l) => l.id === skills.data?.next_lesson_id)

  const academyLessons = skills.data?.available
    ? skills.data.academy.categories.flatMap((c) => c.lessons.map((lesson) => ({ ...lesson, topic: c.key })))
    : []
  const days = [...(onboarding.data?.videos ?? [])].sort((a, b) => a.day_number - b.day_number)
  const links = canSeeLinks
    ? CONTENT_VIDEO_LABELS.flatMap(({ key, label }) => {
        const url = contentLinks.data?.[key]
        return url ? [{ key, label, url }] : []
      })
    : []
  const docs = (downloads.data ?? []).filter((d) => d.available)

  const news = [
    ...docs.map((d) => ({ at: d.created_at, key: `d${d.id}`, kind: 'Publication', title: d.title, href: getDownloadFileUrl(d.id), topic: documentTopicKey(d) })),
    ...(notices.data?.items ?? []).map((n) => ({ at: n.created_at, key: `n${n.id}`, kind: 'Notice', title: n.message || 'Voice note', to: '/dashboard/other/notice-board', topic: 'notice' })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10)

  return (
    <div className="mb-8 space-y-8">
      {nextDay || nextLesson ? (
        <Rail title="Continue Learning">
          {nextDay ? (
            <Tile topic="onboarding" caption={dayCaption(nextDay.day_number, nextDay.title)} />
          ) : null}
          {nextLesson ? (
            <Tile
              to={`${TRAINING}?lesson=${nextLesson.id}`}
              topic={nextLesson.topic}
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
                  topic={l.topic}
                  badge={l.duration_minutes ? `${l.duration_minutes} min` : undefined}
                  done={l.completed}
                  caption={l.title}
                />
              ))
            : days.map((v) => (
                <Tile
                  key={v.day_number}
                  topic="onboarding"
                  locked={v.unlocked === false}
                  done={doneDays.has(v.day_number)}
                  caption={dayCaption(v.day_number, v.title)}
                />
              ))}
        </Rail>
      ) : null}

      {links.length > 0 || docs.length > 0 ? (
        <Rail title="Share with Prospects" more={{ to: '/dashboard/library?tab=publications', label: 'Publications' }}>
          {links.map((l) => (
            <Tile key={l.key} href={l.url} topic="prospect_video" caption={l.label} />
          ))}
          {docs.map((d) => (
            <Tile key={d.id} href={getDownloadFileUrl(d.id)} topic={documentTopicKey(d)} caption={d.title} />
          ))}
        </Rail>
      ) : null}

      {news.length > 0 ? (
        <Rail title="What's New">
          {news.map((n) => (
            <NewsCard key={n.key} to={'to' in n ? n.to : undefined} href={'href' in n ? n.href : undefined} topic={n.topic} kind={n.kind} title={n.title} meta={ago(n.at)} />
          ))}
        </Rail>
      ) : null}
    </div>
  )
}
