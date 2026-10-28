import { CheckCircle2, ChevronDown, GraduationCap, Lock, Sparkles, Sprout } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PersonalDevelopmentPanel, SkillsAcademyPanel } from '@/components/training/SkillsAcademyPanels'
import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'
import { Badge } from '@/components/ui/badge'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useSkillsTrainingQuery, type SkillTrainingSurface } from '@/hooks/use-skills-training-query'
import { useSystemSurfaceQuery } from '@/hooks/use-system-surface-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

type BadgeVariant = 'success' | 'primary' | 'secondary' | 'warning'

const STORAGE_KEY = 'myle.training-hub.sections'

function readSaved(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function saveOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSaved(), [id]: open }))
  } catch {
    /* storage unavailable — section state just won't persist */
  }
}

function TrainingSection({
  id,
  icon,
  title,
  subtitle,
  badge,
  defaultOpen,
  forceOpen = false,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  subtitle: string
  badge: { label: string; variant: BadgeVariant }
  defaultOpen: boolean
  /** Open regardless of the remembered state (a lesson was linked into this section). */
  forceOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => forceOpen || (readSaved()[id] ?? defaultOpen))
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (forceOpen) ref.current?.scrollIntoView({ block: 'start' })
  }, [forceOpen])
  const toggle = () => {
    setOpen((cur) => {
      saveOpen(id, !cur)
      return !cur
    })
  }

  return (
    <section ref={ref} className="surface-elevated scroll-mt-4 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`training-section-${id}`}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">{title}</span>
          <span className="block text-sm text-muted-foreground">{subtitle}</span>
          <Badge variant={badge.variant} className="mt-1.5 w-fit sm:hidden">
            {badge.label}
          </Badge>
        </span>
        <Badge variant={badge.variant} className="hidden shrink-0 sm:inline-flex">
          {badge.label}
        </Badge>
        <ChevronDown
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={`training-section-${id}`} className="border-t border-border px-4 py-4 md:px-5">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function JourneyStep({
  step,
  title,
  detail,
  done,
  locked,
}: {
  step: number
  title: string
  detail: string
  done: boolean
  locked: boolean
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done ? 'bg-success/15 text-success-ink' : locked ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : locked ? <Lock className="size-3.5" /> : step}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </li>
  )
}

type Progress = { total_lessons: number; completed_lessons: number }

function lessonsDetail(unlocked: boolean, track: Progress | undefined, lockedText: string): string {
  if (!unlocked) return lockedText
  if (!track || track.total_lessons === 0) return 'Unlocked'
  return `${track.completed_lessons} of ${track.total_lessons} lessons completed`
}

const isDone = (t: Progress | undefined) => !!t && t.total_lessons > 0 && t.completed_lessons >= t.total_lessons

/** Screen A — where the member is on the learning journey and what to do next. */
function GrowthJourney({
  skills,
  onboardingDone,
  doneDays,
  totalDays,
}: {
  skills: SkillTrainingSurface | undefined
  onboardingDone: boolean
  doneDays: number
  totalDays: number
}) {
  const ob = skills?.onboarding
  const completed = ob?.completed_days ?? doneDays
  const total = ob?.total_days || totalDays || 7
  const unlocked = onboardingDone
  const pd = skills?.personal_development
  const academy = skills?.academy
  const lessons = [...(pd?.lessons ?? []), ...(academy?.categories.flatMap((c) => c.lessons) ?? [])]
  const nextLesson = lessons.find((l) => l.id === skills?.next_lesson_id)
  const lockedText = `Complete all ${total} onboarding days to unlock.`

  let next: string
  if (!unlocked) {
    if (ob?.awaiting_certification) next = 'Pass the onboarding test to unlock Personal Development and the Skills Academy.'
    else if (ob?.current_day) next = `Continue onboarding — Day ${ob.current_day} of ${total}.`
    else next = 'Continue your onboarding training.'
  } else if (nextLesson) next = `${nextLesson.title} — your next lesson.`
  else if (skills && skills.total_lessons > 0 && skills.completed_lessons >= skills.total_lessons)
    next = 'Every lesson done — keep applying them in the field.'
  else next = 'New lessons are on the way.'

  return (
    <section className="surface-elevated space-y-4 px-5 py-4">
      <h2 className="font-semibold text-foreground">Your Growth Journey</h2>
      <ol className="space-y-3">
        <JourneyStep
          step={1}
          title="7-Day Onboarding"
          detail={unlocked ? 'Completed' : `${completed} of ${total} days completed`}
          done={unlocked}
          locked={false}
        />
        <JourneyStep
          step={2}
          title="Personal Development"
          detail={lessonsDetail(unlocked, pd, lockedText)}
          done={isDone(pd)}
          locked={!unlocked}
        />
        <JourneyStep
          step={3}
          title="Skills Academy"
          detail={lessonsDetail(unlocked, academy, lockedText)}
          done={isDone(academy)}
          locked={!unlocked}
        />
      </ol>
      <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-sm text-foreground">
        <span className="font-medium">Next: </span>
        {next}
      </p>
    </section>
  )
}

function trackBadge(unlocked: boolean, track: Progress | undefined, lockedBadge: { label: string; variant: BadgeVariant }) {
  if (!unlocked) return lockedBadge
  if (!track || track.total_lessons === 0) return { label: 'Coming soon', variant: 'secondary' as BadgeVariant }
  return {
    label: `${track.completed_lessons}/${track.total_lessons} done`,
    variant: (isDone(track) ? 'success' : 'primary') as BadgeVariant,
  }
}

/**
 * Single Training home: the Growth Journey summary, then three separate collapsible
 * sections — 7-day onboarding (required to unlock the app, open anytime to revise),
 * Personal Development and the Skills Academy. Whichever one the member should
 * work on now starts expanded.
 */
export function TrainingHubPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const onboarding = useSystemSurfaceQuery('training')
  const skills = useSkillsTrainingQuery()

  const statusLc = (me?.training_status ?? '').toLowerCase()
  // The server's verdict wins once loaded; `me` only covers the first paint.
  const onboardingDone = skills.data
    ? skills.data.onboarding.status === 'completed'
    : me?.training_required !== true || statusLc === 'completed'

  const onboardingData = onboarding.data && 'videos' in onboarding.data ? onboarding.data : null
  const onboardingTotal = onboardingData?.videos.length ?? 0
  const onboardingDoneDays = onboardingData?.progress.filter((p) => p.completed).length ?? 0

  let onboardingBadge: { label: string; variant: BadgeVariant }
  if (onboardingDone) onboardingBadge = { label: 'Completed', variant: 'success' }
  else if (onboardingTotal > 0) onboardingBadge = { label: `${onboardingDoneDays}/${onboardingTotal} days`, variant: 'warning' }
  else onboardingBadge = { label: 'In progress', variant: 'warning' }

  const unlocked = onboardingDone
  const teaser = skills.data?.onboarding.teaser === true
  const pd = skills.data?.personal_development
  const academy = skills.data?.academy
  const locked = { label: 'Locked', variant: 'secondary' as BadgeVariant }
  const pdBadge = trackBadge(unlocked, pd, locked)
  const academyBadge = trackBadge(unlocked, academy, teaser ? { label: 'Almost there', variant: 'primary' } : locked)
  // Work on Personal Development until it's done, then the academy.
  const pdOpen = unlocked && !!pd && pd.total_lessons > 0 && !isDone(pd)
  const academyOpen = (unlocked && !pdOpen) || teaser
  // Section open state is read once; wait for the server's answer before picking a default.
  const sectionKey = skills.data ? 'ready' : 'loading'
  // A lesson linked from the Library opens its section.
  const [searchParams] = useSearchParams()
  const linkedLesson = Number(searchParams.get('lesson'))
  const pdLinked = !!pd?.lessons.some((l) => l.id === linkedLesson)
  const academyLinked = !!academy?.categories.some((c) => c.lessons.some((l) => l.id === linkedLesson))

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {onboardingDone
            ? 'Your onboarding is complete. Keep growing with Personal Development and the Skills Academy below.'
            : 'Finish the 7-day onboarding to unlock the full app.'}
        </p>
      </div>

      <GrowthJourney
        skills={skills.data}
        onboardingDone={onboardingDone}
        doneDays={onboardingDoneDays}
        totalDays={onboardingTotal}
      />

      <TrainingSection
        id="onboarding"
        icon={<GraduationCap className="size-5" />}
        title="7-Day Onboarding Training"
        subtitle={onboardingDone ? 'Completed — open anytime to revise' : 'Required to unlock the app'}
        badge={onboardingBadge}
        defaultOpen={!onboardingDone}
      >
        {onboarding.isPending ? <LoadingState label="Loading training..." /> : null}
        {onboarding.isError ? (
          <ErrorState
            title="Could not load training"
            message={onboarding.error instanceof Error ? onboarding.error.message : 'Please try again.'}
            onRetry={() => void onboarding.refetch()}
          />
        ) : null}
        {onboardingData ? <TrainingProgramPanel data={onboardingData} /> : null}
      </TrainingSection>

      <TrainingSection
        key={`personal-${sectionKey}`}
        id="personal-development"
        icon={unlocked ? <Sprout className="size-5" /> : <Lock className="size-5" />}
        title="Personal Development"
        subtitle={unlocked ? 'Mindset, habits and personal growth' : 'Unlocks after all 7 onboarding days'}
        badge={pdBadge}
        defaultOpen={pdOpen}
        forceOpen={pdLinked}
      >
        <PersonalDevelopmentPanel />
      </TrainingSection>

      <TrainingSection
        key={`academy-${sectionKey}`}
        id="skills-academy"
        icon={unlocked ? <Sparkles className="size-5" /> : <Lock className="size-5" />}
        title="Skills Academy"
        subtitle={
          unlocked
            ? 'Six skill areas — learn, practise, apply'
            : teaser
              ? 'Your next level is near — finish onboarding to unlock'
              : 'Unlocks after all 7 onboarding days'
        }
        badge={academyBadge}
        defaultOpen={academyOpen}
        forceOpen={academyLinked}
      >
        <SkillsAcademyPanel />
      </TrainingSection>
    </div>
  )
}
