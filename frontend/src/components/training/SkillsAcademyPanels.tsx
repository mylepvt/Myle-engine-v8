import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Clock, Lock, PenLine, PlayCircle, Plus, Rocket, Sprout, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, InlineEmpty, LoadingState } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  skillLessonEmbedUrl,
  useCompleteSkillLessonMutation,
  useCreateSkillLessonMutation,
  useDeleteSkillLessonMutation,
  useSkillsTrainingProgressQuery,
  useSkillsTrainingQuery,
  useUpdateSkillLessonMutation,
  type OnboardingSummary,
  type SkillCategory,
  type SkillLesson,
} from '@/hooks/use-skills-training-query'
import { cn } from '@/lib/utils'

const PRACTICE_MIN_CHARS = 20

const pad = (n: number) => String(n).padStart(2, '0')

/** "01"–"06" for the skill categories; Personal Development has no number. */
function CategoryNumber({ number }: { number: number | null }) {
  return number === null ? (
    <Sprout className="size-4 shrink-0 text-primary" aria-hidden />
  ) : (
    <span className="font-mono text-sm text-muted-foreground">{pad(number)}</span>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

/* ── Locked: outline preview + Day 7 teaser ─────────────────────────────── */

function LockedPreview({
  onboarding,
  categories,
  showTeaser,
}: {
  onboarding: OnboardingSummary
  categories: SkillCategory[]
  showTeaser: boolean
}) {
  return (
    <div className="space-y-4">
      {showTeaser && onboarding.teaser ? (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-5 py-5">
          <div className="flex items-center gap-2 text-primary">
            <Rocket className="size-5" />
            <p className="text-ds-caption font-semibold uppercase tracking-wide">Level 2 preview</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">Your next level is near!</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You have spent the last seven days building your foundation. Now it is time to take your personality,
            communication, invitation, follow-up, and closing skills to the next level.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The upcoming training will introduce practical skills to help improve your confidence and business approach.
          </p>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {onboarding.awaiting_certification
              ? 'All 7 days done — pass the onboarding test to unlock Skills Academy!'
              : 'Complete your 7 days onboarding training to unlock next-level Skills Training!'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {onboarding.awaiting_certification
            ? 'All 7 days done — pass the onboarding test to unlock.'
            : 'Complete all 7 onboarding days to unlock.'}
        </p>
      )}

      <ol className="space-y-2">
        {categories.map((c) => (
          <li key={c.key} className="surface-inset flex items-center gap-3 px-4 py-3 opacity-80">
            <CategoryNumber number={c.number} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">{c.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{c.purpose}</span>
            </span>
            {c.total_lessons > 0 ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.total_lessons} {c.total_lessons === 1 ? 'lesson' : 'lessons'}
              </span>
            ) : null}
            <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Locked" />
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ── Unlocked: categories + lesson detail ───────────────────────────────── */

function LessonRow({ lesson, onOpen }: { lesson: SkillLesson; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      {lesson.completed ? (
        <CheckCircle2 className="size-5 shrink-0 text-success-ink" aria-label="Completed" />
      ) : (
        <PlayCircle className={cn('size-5 shrink-0', lesson.has_video ? 'text-primary' : 'text-muted-foreground')} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-ds-caption uppercase tracking-wide text-muted-foreground">Video {pad(lesson.number)}</span>
        <span className="block truncate font-medium text-foreground">{lesson.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {lesson.duration_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {lesson.duration_minutes} min
            </span>
          ) : null}
          {lesson.practice_task ? (
            <span className="inline-flex items-center gap-1">
              <PenLine className="size-3" />
              {lesson.practice_required ? 'Practice task required' : 'Practice task'}
            </span>
          ) : null}
          {!lesson.has_video ? <span>Recording coming soon</span> : null}
        </span>
      </span>
      {lesson.completed ? (
        <Badge variant="success" className="shrink-0">
          Done
        </Badge>
      ) : null}
    </button>
  )
}

function CategorySection({
  category,
  open,
  onToggle,
  onOpenLesson,
}: {
  category: SkillCategory
  open: boolean
  onToggle: () => void
  onOpenLesson: (id: number) => void
}) {
  const badge =
    category.total_lessons === 0
      ? { label: 'Coming soon', variant: 'secondary' as const }
      : {
          label: `${category.completed_lessons}/${category.total_lessons}`,
          variant: category.status === 'completed' ? ('success' as const) : ('primary' as const),
        }
  return (
    <div className="surface-inset overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <CategoryNumber number={category.number} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{category.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{category.purpose}</span>
        </span>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className="border-t border-border px-1 py-1">
          {category.lessons.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Lessons will be added soon.</p>
          ) : (
            category.lessons.map((l) => <LessonRow key={l.id} lesson={l} onOpen={() => onOpenLesson(l.id)} />)
          )}
        </div>
      ) : null}
    </div>
  )
}

function LessonDetail({
  category,
  lesson,
  next,
  backLabel,
  onBack,
  onNext,
}: {
  category: SkillCategory
  lesson: SkillLesson
  next: SkillLesson | null
  backLabel: string
  onBack: () => void
  onNext: () => void
}) {
  const complete = useCompleteSkillLessonMutation()
  const [answer, setAnswer] = useState(lesson.practice_response ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setAnswer(lesson.practice_response ?? '')
    setError(null)
    setSaved(false)
  }, [lesson.id, lesson.practice_response])

  const trimmed = answer.trim()
  const needsAnswer = lesson.practice_required && trimmed.length < PRACTICE_MIN_CHARS
  const answerChanged = trimmed !== (lesson.practice_response ?? '').trim()

  const submit = async () => {
    setError(null)
    setSaved(false)
    try {
      await complete.mutateAsync({ lessonId: lesson.id, practiceResponse: trimmed || undefined })
      setSaved(true)
    } catch (e) {
      setError(errorText(e, 'Could not save. Please try again.'))
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft />
        {backLabel}
      </Button>

      <div>
        <p className="text-ds-caption font-semibold uppercase tracking-wide text-primary">
          {category.title} · Video {pad(lesson.number)} of {pad(category.total_lessons)}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{lesson.title}</h3>
        {lesson.duration_minutes ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {lesson.duration_minutes} min
          </p>
        ) : null}
      </div>

      {lesson.has_video ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            src={skillLessonEmbedUrl(lesson.id)}
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope"
            title={lesson.title}
          />
        </div>
      ) : (
        <p className="surface-inset px-4 py-6 text-center text-sm text-muted-foreground">
          The recording for this lesson will be added soon.
        </p>
      )}

      {lesson.description ? <p className="whitespace-pre-line text-sm text-foreground">{lesson.description}</p> : null}

      {lesson.practice_task ? (
        <div className="surface-inset space-y-2 px-4 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PenLine className="size-4 text-primary" />
            Practice task
            {lesson.practice_required ? (
              <Badge variant="warning">Required</Badge>
            ) : (
              <Badge variant="secondary">Optional</Badge>
            )}
          </p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{lesson.practice_task}</p>
          <label className="block text-ds-caption text-muted-foreground">
            Your answer — a script, role-play notes or what you will try
            <textarea
              className="field-input mt-1 min-h-[96px] w-full"
              value={answer}
              maxLength={4000}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!lesson.has_video}
            />
          </label>
          {lesson.practice_required && needsAnswer ? (
            <p className="text-xs text-muted-foreground">Write at least {PRACTICE_MIN_CHARS} characters to complete this lesson.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!lesson.completed ? (
          <Button onClick={() => void submit()} disabled={complete.isPending || !lesson.has_video || needsAnswer}>
            {complete.isPending ? 'Saving…' : 'Mark as complete'}
          </Button>
        ) : (
          <>
            <Badge variant="success" className="h-7 px-3 text-xs">
              <CheckCircle2 className="mr-1 size-3.5" />
              Completed
            </Badge>
            {lesson.practice_task && answerChanged && !needsAnswer ? (
              <Button variant="secondary" size="sm" onClick={() => void submit()} disabled={complete.isPending}>
                {complete.isPending ? 'Saving…' : 'Update answer'}
              </Button>
            ) : null}
          </>
        )}
        {next ? (
          <Button variant={lesson.completed ? 'default' : 'secondary'} onClick={onNext} className="ml-auto">
            Next lesson
            <ArrowRight />
          </Button>
        ) : null}
      </div>
      {saved && lesson.completed ? <p className="text-sm text-success-ink">Saved.</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

/**
 * A list of lessons with progress, "Start / Continue" and the lesson detail view.
 * One category renders as a flat list (Personal Development); several render as
 * expandable dropdowns (Skills Academy), each with its own progress badge.
 */
function Track({
  categories,
  totalLessons,
  completedLessons,
  nextLessonId,
}: {
  categories: SkillCategory[]
  totalLessons: number
  completedLessons: number
  nextLessonId: number | null
}) {
  const flat = categories.length === 1
  const ordered = useMemo(
    () => categories.flatMap((c) => c.lessons.map((lesson) => ({ category: c, lesson }))),
    [categories],
  )
  const [lessonId, setLessonId] = useState<number | null>(null)
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    const nextCat = ordered.find((x) => x.lesson.id === nextLessonId)?.category.key
    return new Set(nextCat ? [nextCat] : [])
  })

  const current = lessonId === null ? -1 : ordered.findIndex((x) => x.lesson.id === lessonId)
  const nextLesson = ordered.find((x) => x.lesson.id === nextLessonId)

  const openLesson = (id: number) => {
    const cat = ordered.find((x) => x.lesson.id === id)?.category.key
    if (cat) setOpenCategories((s) => new Set(s).add(cat))
    setLessonId(id)
  }

  if (current >= 0) {
    const { category, lesson } = ordered[current]
    const next = ordered[current + 1] ?? null
    return (
      <LessonDetail
        category={category}
        lesson={lesson}
        next={next?.lesson ?? null}
        backLabel={flat ? 'All lessons' : 'All categories'}
        onBack={() => setLessonId(null)}
        onNext={() => next && openLesson(next.lesson.id)}
      />
    )
  }

  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  return (
    <div className="space-y-4">
      {totalLessons > 0 ? (
        <div className="surface-inset space-y-3 px-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedLessons} of {totalLessons} lessons completed
            </span>
            <span className="font-medium text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          {nextLesson ? (
            <Button onClick={() => openLesson(nextLesson.lesson.id)} className="w-full sm:w-auto">
              <PlayCircle />
              {completedLessons === 0 ? 'Start' : 'Continue'}: {nextLesson.lesson.title}
            </Button>
          ) : completedLessons >= totalLessons ? (
            <p className="text-sm font-medium text-success-ink">You have completed every lesson available so far.</p>
          ) : null}
        </div>
      ) : null}

      {flat ? (
        <div className="surface-inset px-1 py-1">
          {categories[0].lessons.map((l) => (
            <LessonRow key={l.id} lesson={l} onOpen={() => openLesson(l.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <CategorySection
              key={c.key}
              category={c}
              open={openCategories.has(c.key)}
              onToggle={() =>
                setOpenCategories((s) => {
                  const n = new Set(s)
                  if (n.has(c.key)) n.delete(c.key)
                  else n.add(c.key)
                  return n
                })
              }
              onOpenLesson={openLesson}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Admin: lesson editor ───────────────────────────────────────────────── */

type Draft = {
  title: string
  youtube_url: string
  duration: string
  description: string
  practice_task: string
  practice_required: boolean
}

function draftFrom(lesson?: SkillLesson): Draft {
  return {
    title: lesson?.title ?? '',
    youtube_url: lesson?.youtube_url ?? '',
    duration: lesson?.duration_minutes ? String(lesson.duration_minutes) : '',
    description: lesson?.description ?? '',
    practice_task: lesson?.practice_task ?? '',
    practice_required: lesson?.practice_required ?? false,
  }
}

function LessonEditor({ category, lesson, onDone }: { category: string; lesson?: SkillLesson; onDone: () => void }) {
  const create = useCreateSkillLessonMutation()
  const update = useUpdateSkillLessonMutation()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(lesson))
  const [error, setError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async () => {
    setError(null)
    const duration = Number.parseInt(draft.duration, 10)
    const input = {
      title: draft.title.trim(),
      youtube_url: draft.youtube_url.trim(),
      duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : null,
      description: draft.description.trim(),
      practice_task: draft.practice_task.trim(),
      practice_required: draft.practice_required && draft.practice_task.trim().length > 0,
    }
    try {
      if (lesson) await update.mutateAsync({ id: lesson.id, ...input })
      else await create.mutateAsync({ category, ...input })
      onDone()
    } catch (e) {
      setError(errorText(e, 'Save failed'))
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
        <Input placeholder="Lesson title" value={draft.title} onChange={(e) => set('title', e.target.value)} />
        <Input placeholder="Unlisted YouTube link" value={draft.youtube_url} onChange={(e) => set('youtube_url', e.target.value)} />
        <Input placeholder="Min" inputMode="numeric" value={draft.duration} onChange={(e) => set('duration', e.target.value.replace(/\D/g, ''))} />
      </div>
      <textarea
        className="field-input min-h-[56px] w-full"
        placeholder="Short description — what is the skill and why it matters"
        value={draft.description}
        onChange={(e) => set('description', e.target.value)}
      />
      <textarea
        className="field-input min-h-[56px] w-full"
        placeholder="Practice task — e.g. write your invitation script for a cold contact"
        value={draft.practice_task}
        onChange={(e) => set('practice_task', e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={draft.practice_required}
          onCheckedChange={(v) => set('practice_required', v)}
          disabled={!draft.practice_task.trim()}
        />
        Require a practice answer to complete this lesson
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={pending || !draft.title.trim()}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  )
}

function AdminLessonManager({ categories }: { categories: SkillCategory[] }) {
  const remove = useDeleteSkillLessonMutation()
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SkillLesson | null>(null)

  return (
    <div className="surface-inset px-4 py-4">
      <h3 className="font-semibold text-foreground">Manage lessons</h3>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Add an unlisted YouTube link, duration, description and practice task for each lesson. Members can complete a
        lesson once its recording is added.
      </p>
      <div className="space-y-4">
        {categories.map((c) => (
          <div key={c.key} className="space-y-2">
            <p className="text-sm font-semibold text-foreground">
              {c.number === null ? c.title : `${pad(c.number)} · ${c.title}`}
            </p>
            {c.lessons.map((l) =>
              editing === `lesson-${l.id}` ? (
                <LessonEditor key={l.id} category={c.key} lesson={l} onDone={() => setEditing(null)} />
              ) : (
                <div key={l.id} className="flex items-center gap-2 border-t border-border pt-2 text-sm first:border-t-0">
                  <span className="w-8 font-mono text-xs text-muted-foreground">{pad(l.number)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{l.title}</span>
                  {!l.has_video ? <Badge variant="warning">No video</Badge> : null}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(`lesson-${l.id}`)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${l.title}`} onClick={() => setConfirmDelete(l)}>
                    <Trash2 />
                  </Button>
                </div>
              ),
            )}
            {editing === `new-${c.key}` ? (
              <LessonEditor category={c.key} onDone={() => setEditing(null)} />
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(`new-${c.key}`)}>
                <Plus />
                Add lesson
              </Button>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete lesson?"
        description={confirmDelete ? `“${confirmDelete.title}” and every member's completion of it will be removed.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) void remove.mutateAsync(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

/* ── Leader / admin: team progress ──────────────────────────────────────── */

function Count({ done, total }: { done: number; total: number }) {
  return <span className={cn(done >= total && total > 0 && 'font-semibold text-success-ink')}>{done}/{total}</span>
}

function ProgressTable({ enabled }: { enabled: boolean }) {
  const { data, isPending, isError, error } = useSkillsTrainingProgressQuery(enabled)
  if (!enabled) return null
  return (
    <div className="surface-inset px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-4 text-primary" />
        <h3 className="font-semibold text-foreground">Team progress</h3>
      </div>
      {isPending ? <LoadingState label="Loading progress..." /> : null}
      {isError ? <p className="text-sm text-destructive">{errorText(error, 'Failed to load')}</p> : null}
      {data && data.members.length === 0 ? <InlineEmpty>No members yet.</InlineEmpty> : null}
      {data && data.members.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ds-caption uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2">Member</th>
                <th className="px-2 py-2">Personal Dev</th>
                <th className="px-2 py-2">Academy</th>
                <th className="px-2 py-2">Practice</th>
                <th className="px-2 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user_id} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{m.fbo_id}</p>
                  </td>
                  {m.available ? (
                    <>
                      <td className="px-2 py-2">
                        <Count done={m.personal_development_completed} total={data.personal_development_total} />
                      </td>
                      <td className="px-2 py-2">
                        <span
                          title={data.categories
                            .filter((c) => c.number !== null)
                            .map((c) => `${c.title}: ${m.by_category[c.key] ?? 0}/${c.total_lessons}`)
                            .join('\n')}
                        >
                          <Count done={m.academy_completed} total={data.academy_total} />
                        </span>
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-2" colSpan={2}>
                      <span className="text-xs text-muted-foreground">In onboarding</span>
                    </td>
                  )}
                  <td className="px-2 py-2">{m.available ? m.practice_submitted : '—'}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {m.last_completed_at ? formatDate(m.last_completed_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function LoadState({ isPending, isError, error, refetch }: ReturnType<typeof useSkillsTrainingQuery>) {
  return (
    <>
      {isPending ? <LoadingState label="Loading lessons..." /> : null}
      {isError ? (
        <ErrorState
          title="Could not load lessons"
          message={errorText(error, 'Please try again.')}
          onRetry={() => void refetch()}
        />
      ) : null}
    </>
  )
}

/**
 * Personal Development — its own Training hub section, separate from the academy.
 * Same unlock rule as the academy (verified onboarding); progress is its own.
 */
export function PersonalDevelopmentPanel() {
  const { data: me } = useAuthMeQuery()
  const query = useSkillsTrainingQuery()
  const { data } = query
  const isAdmin = me?.role === 'admin'
  const pd = data?.personal_development

  return (
    <div className="space-y-4">
      <LoadState {...query} />
      {data && pd && !data.available ? (
        <LockedPreview onboarding={data.onboarding} categories={[pd]} showTeaser={false} />
      ) : null}
      {data && pd && data.available && pd.total_lessons === 0 && !isAdmin ? (
        <EmptyState title="Coming soon" description="Lessons have not been added yet." />
      ) : null}
      {data && pd && data.available && pd.total_lessons > 0 ? (
        <Track
          categories={[pd]}
          totalLessons={pd.total_lessons}
          completedLessons={pd.completed_lessons}
          nextLessonId={pd.next_lesson_id}
        />
      ) : null}
      {isAdmin && pd ? <AdminLessonManager categories={[pd]} /> : null}
    </div>
  )
}

/**
 * Skills Academy — six categories, each an expandable dropdown with its own progress.
 * Locked → outline preview (+ the Day 7 teaser). Access is decided by the API;
 * admins also get the lesson editor, leaders / admins the team progress.
 */
export function SkillsAcademyPanel() {
  const { data: me } = useAuthMeQuery()
  const query = useSkillsTrainingQuery()
  const { data } = query
  const isAdmin = me?.role === 'admin'
  const canSeeProgress = me?.role === 'admin' || me?.role === 'leader'
  const academy = data?.academy

  return (
    <div className="space-y-4">
      <LoadState {...query} />
      {data && academy && !data.available ? (
        <LockedPreview onboarding={data.onboarding} categories={academy.categories} showTeaser />
      ) : null}
      {data && academy && data.available ? (
        <>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Skills Academy</h3>
            <p className="text-sm text-muted-foreground">Build skills. Take action. Improve.</p>
          </div>
          {academy.total_lessons === 0 && !isAdmin ? (
            <EmptyState title="Coming soon" description="Lessons have not been added yet." />
          ) : (
            <Track
              categories={academy.categories}
              totalLessons={academy.total_lessons}
              completedLessons={academy.completed_lessons}
              nextLessonId={academy.next_lesson_id}
            />
          )}
        </>
      ) : null}
      {isAdmin && academy ? <AdminLessonManager categories={academy.categories} /> : null}
      <ProgressTable enabled={canSeeProgress} />
    </div>
  )
}
