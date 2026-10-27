import { CheckCircle2, ChevronDown, GraduationCap, Lock, Sprout } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { SkillsTrainingPanel } from '@/components/training/SkillsTrainingPanel'
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
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  subtitle: string
  badge: { label: string; variant: BadgeVariant }
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => readSaved()[id] ?? defaultOpen)
  const toggle = () => {
    setOpen((cur) => {
      saveOpen(id, !cur)
      return !cur
    })
  }

  return (
    <section className="surface-elevated overflow-hidden">
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
  level,
  title,
  detail,
  done,
  locked,
}: {
  level: number
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
        {done ? <CheckCircle2 className="size-4" /> : locked ? <Lock className="size-3.5" /> : level}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          Level {level} · {title}
        </span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </li>
  )
}

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
  const nextLesson = skills?.categories.flatMap((c) => c.lessons).find((l) => l.id === skills.next_lesson_id)

  let next: string
  if (!unlocked) {
    if (ob?.awaiting_certification) next = 'Pass the onboarding test to unlock the Skills Academy.'
    else if (ob?.current_day) next = `Continue onboarding — Day ${ob.current_day} of ${total}.`
    else next = 'Continue your onboarding training.'
  } else if (nextLesson) next = `${nextLesson.title} — your next lesson.`
  else if (skills && skills.total_lessons > 0 && skills.status === 'completed') next = 'Every lesson done — keep applying them in the field.'
  else next = 'New lessons are on the way.'

  return (
    <section className="surface-elevated space-y-4 px-5 py-4">
      <h2 className="font-semibold text-foreground">Your Growth Journey</h2>
      <ol className="space-y-3">
        <JourneyStep
          level={1}
          title="Onboarding Foundation"
          detail={unlocked ? 'Completed' : `${completed} of ${total} days completed`}
          done={unlocked}
          locked={false}
        />
        <JourneyStep
          level={2}
          title="Skills Academy"
          detail={
            unlocked
              ? skills && skills.total_lessons > 0
                ? `${skills.completed_lessons} of ${skills.total_lessons} lessons completed`
                : 'Unlocked'
              : `Complete all ${total} onboarding days to unlock.`
          }
          done={!!skills && skills.total_lessons > 0 && skills.status === 'completed'}
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

/**
 * Single Training home: the Growth Journey summary, 7-day onboarding (required to
 * unlock the app) and the post-onboarding Skills Academy, as two collapsible sections.
 * Whichever one the member should work on now starts expanded.
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

  const skillsOpen = onboardingDone
  const teaser = skills.data?.onboarding.teaser === true

  let skillsBadge: { label: string; variant: BadgeVariant }
  if (skills.data && !skills.data.available)
    skillsBadge = teaser ? { label: 'Almost there', variant: 'primary' } : { label: 'Locked', variant: 'secondary' }
  else if (skills.data && skills.data.total_lessons > 0)
    skillsBadge = {
      label: `${skills.data.completed_lessons}/${skills.data.total_lessons} done`,
      variant: skills.data.status === 'completed' ? 'success' : 'primary',
    }
  else skillsBadge = { label: 'Coming soon', variant: 'secondary' }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {onboardingDone
            ? 'Your onboarding is complete. Keep growing with the Skills Academy below.'
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
        id="skills"
        icon={skillsOpen ? <Sprout className="size-5" /> : <Lock className="size-5" />}
        title="Personal Development & Skills Academy"
        subtitle={
          skillsOpen
            ? 'Personal development and six skill areas — learn, practise, apply'
            : teaser
              ? 'Your next level is near — finish onboarding to unlock'
              : 'Unlocks after all 7 onboarding days'
        }
        badge={skillsBadge}
        defaultOpen={skillsOpen || teaser}
      >
        <SkillsTrainingPanel />
      </TrainingSection>
    </div>
  )
}
