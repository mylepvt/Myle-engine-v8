import { ChevronDown, GraduationCap, Lock, Sprout } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { SkillsTrainingPanel } from '@/components/training/SkillsTrainingPanel'
import { TrainingProgramPanel } from '@/components/training/TrainingProgramPanel'
import { Badge } from '@/components/ui/badge'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useSkillsTrainingQuery } from '@/hooks/use-skills-training-query'
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

/**
 * Single Training home: 7-day onboarding (required to unlock the app) and the
 * post-unlock Personal Development & Skills track, as two collapsible sections.
 * Whichever one the member should work on now starts expanded.
 */
export function TrainingHubPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const onboarding = useSystemSurfaceQuery('training')
  const skills = useSkillsTrainingQuery()

  const statusLc = (me?.training_status ?? '').toLowerCase()
  const onboardingDone = me?.training_required !== true || statusLc === 'completed'

  const onboardingData = onboarding.data && 'videos' in onboarding.data ? onboarding.data : null
  const onboardingTotal = onboardingData?.videos.length ?? 0
  const onboardingDoneDays = onboardingData?.progress.filter((p) => p.completed).length ?? 0

  let onboardingBadge: { label: string; variant: BadgeVariant }
  if (onboardingDone) onboardingBadge = { label: 'Completed', variant: 'success' }
  else if (onboardingTotal > 0) onboardingBadge = { label: `${onboardingDoneDays}/${onboardingTotal} days`, variant: 'warning' }
  else onboardingBadge = { label: 'In progress', variant: 'warning' }

  let skillsBadge: { label: string; variant: BadgeVariant }
  if (skills.data && !skills.data.available) skillsBadge = { label: 'Locked', variant: 'secondary' }
  else if (skills.data && skills.data.total_days > 0)
    skillsBadge = {
      label: `${skills.data.completed_days}/${skills.data.total_days} done`,
      variant: skills.data.completed_days >= skills.data.total_days ? 'success' : 'primary',
    }
  else skillsBadge = { label: 'Coming soon', variant: 'secondary' }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {onboardingDone
            ? 'Your onboarding is complete. Keep growing with the personal development lessons below.'
            : 'Finish the 7-day onboarding to unlock the full app.'}
        </p>
      </div>

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
        icon={onboardingDone ? <Sprout className="size-5" /> : <Lock className="size-5" />}
        title="Personal Development & Skills"
        subtitle={onboardingDone ? 'One new lesson each day — watch alongside your work' : 'Unlocks after onboarding'}
        badge={skillsBadge}
        defaultOpen={onboardingDone}
      >
        <SkillsTrainingPanel />
      </TrainingSection>
    </div>
  )
}
