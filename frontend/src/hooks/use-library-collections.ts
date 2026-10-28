import { CONTENT_VIDEO_LABELS } from '@/config/content-links'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useContentLinksQuery } from '@/hooks/use-content-links-query'
import { useSkillsTrainingQuery, type SkillCategory } from '@/hooks/use-skills-training-query'
import { useTrainingQuery } from '@/hooks/use-training-query'
import { TRAINING_PATH, dayCaption, thumbFor } from '@/lib/media'

export type LibraryItem = {
  key: string
  caption: string
  to?: string
  href?: string
  thumb: string | null
  badge?: string
  done?: boolean
  locked?: boolean
}

export type LibrarySection = { title: string; items: LibraryItem[] }

export type LibraryCollection = {
  id: 'onboarding' | 'personal-development' | 'academy' | 'prospect'
  title: string
  /** Shown on the inner page when there is nothing to list (locked / empty). */
  note?: string
  /** Not open to this member yet (onboarding unfinished). */
  locked?: boolean
  sections: LibrarySection[]
}

/** Collection titles by id, for the header of the inner page. */
export const LIBRARY_COLLECTION_TITLES: Record<LibraryCollection['id'], string> = {
  onboarding: '7-Day Onboarding',
  'personal-development': 'Personal Development',
  academy: 'Skills Academy',
  prospect: 'Prospect Videos',
}

function lessonItems(category: SkillCategory): LibraryItem[] {
  return category.lessons.map((l) => ({
    key: `l${l.id}`,
    caption: l.title,
    to: `${TRAINING_PATH}?lesson=${l.id}`,
    thumb: thumbFor(l.youtube_url),
    badge: l.duration_minutes ? `${l.duration_minutes} min` : undefined,
    done: l.completed,
  }))
}

/** Video collections for the Library tab, built from the training, skills and content-link data. */
export function useLibraryCollections() {
  const { data: me } = useAuthMeQuery()
  const onboarding = useTrainingQuery()
  const skills = useSkillsTrainingQuery()
  const canSeeLinks = me?.role === 'admin' || me?.role === 'leader'
  const links = useContentLinksQuery()

  const collections: LibraryCollection[] = []

  if (onboarding.data) {
    const done = new Set(onboarding.data.progress.filter((p) => p.completed).map((p) => p.day_number))
    const days = [...onboarding.data.videos].sort((a, b) => a.day_number - b.day_number)
    collections.push({
      id: 'onboarding',
      title: LIBRARY_COLLECTION_TITLES.onboarding,
      sections: [
        {
          title: 'Onboarding Days',
          items: days.map((v) => ({
            key: `d${v.day_number}`,
            caption: dayCaption(v.day_number, v.title),
            to: TRAINING_PATH,
            thumb: v.unlocked === false ? null : thumbFor(v.youtube_url),
            done: done.has(v.day_number),
            locked: v.unlocked === false,
          })),
        },
      ],
    })
  }

  if (skills.data) {
    const locked = !skills.data.available
    const lockedNote = 'Unlocks after the 7-day onboarding.'
    const pd = skills.data.personal_development
    collections.push({
      id: 'personal-development',
      title: LIBRARY_COLLECTION_TITLES['personal-development'],
      locked,
      note: locked ? lockedNote : pd.lessons.length === 0 ? 'Lessons are coming soon.' : undefined,
      sections: pd.lessons.length > 0 ? [{ title: 'Lessons', items: lessonItems(pd) }] : [],
    })
    const cats = skills.data.academy.categories
    collections.push({
      id: 'academy',
      title: LIBRARY_COLLECTION_TITLES.academy,
      locked,
      note: locked ? lockedNote : cats.every((c) => c.lessons.length === 0) ? 'Lessons are coming soon.' : undefined,
      sections: cats
        .filter((c) => c.lessons.length > 0)
        .map((c) => ({ title: c.number ? `${c.number}. ${c.title}` : c.title, items: lessonItems(c) })),
    })
  }

  if (canSeeLinks) {
    const items = CONTENT_VIDEO_LABELS.flatMap(({ key, label }) => {
      const url = links.data?.[key]
      return url ? [{ key, caption: label, href: url, thumb: thumbFor(url) }] : []
    })
    if (items.length > 0) {
      collections.push({ id: 'prospect', title: LIBRARY_COLLECTION_TITLES.prospect, sections: [{ title: 'Share with Prospects', items }] })
    }
  }

  return {
    collections,
    isPending: onboarding.isPending || skills.isPending,
    error: onboarding.error ?? skills.error,
    refetch: () => {
      void onboarding.refetch()
      void skills.refetch()
    },
  }
}
