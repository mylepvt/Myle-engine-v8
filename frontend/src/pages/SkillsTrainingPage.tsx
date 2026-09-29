import { CheckCircle2, Lock, PlayCircle, Sprout, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  skillDayEmbedUrl,
  useMarkSkillDayDoneMutation,
  useSaveSkillDayMutation,
  useSkillsTrainingProgressQuery,
  useSkillsTrainingQuery,
  type SkillTrainingDay,
} from '@/hooks/use-skills-training-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

const TOTAL_SLOTS = 7

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DayCard({ day, open, onToggle }: { day: SkillTrainingDay; open: boolean; onToggle: () => void }) {
  const markDone = useMarkSkillDayDoneMutation()
  const [error, setError] = useState<string | null>(null)

  let status: { label: string; variant: 'success' | 'primary' | 'secondary' }
  if (day.completed) status = { label: 'Done', variant: 'success' }
  else if (day.unlocked) status = { label: 'Open', variant: 'primary' }
  else if (day.unlocks_on) status = { label: `Opens ${formatDate(day.unlocks_on)}`, variant: 'secondary' }
  else status = { label: 'Locked', variant: 'secondary' }

  const done = async () => {
    setError(null)
    try {
      await markDone.mutateAsync(day.day_number)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    }
  }

  return (
    <div className="surface-inset overflow-hidden px-4 py-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed"
        onClick={onToggle}
        disabled={!day.unlocked}
      >
        <div className="flex min-w-0 items-center gap-3">
          {day.completed ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          ) : day.unlocked ? (
            <PlayCircle className="size-5 shrink-0 text-primary" />
          ) : (
            <Lock className="size-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-ds-caption uppercase tracking-wide text-muted-foreground">Day {day.day_number}</p>
            <p className="truncate font-medium text-foreground">{day.title}</p>
          </div>
        </div>
        <Badge variant={status.variant} className="shrink-0">
          {status.label}
        </Badge>
      </button>

      {open && day.unlocked ? (
        <div className="mt-4 space-y-3">
          {day.has_video ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={skillDayEmbedUrl(day.day_number)}
                className="h-full w-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope"
                title={`Skills day ${day.day_number}`}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Recording for this day will be added soon.</p>
          )}
          {!day.completed ? (
            <Button onClick={() => void done()} disabled={markDone.isPending || !day.has_video}>
              {markDone.isPending ? 'Saving…' : 'Mark as done'}
            </Button>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function AdminDayEditor({ dayNumber, day }: { dayNumber: number; day?: SkillTrainingDay }) {
  const save = useSaveSkillDayMutation()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setTitle(day?.title ?? '')
    setUrl(day?.youtube_url ?? '')
  }, [day?.title, day?.youtube_url])

  const submit = async () => {
    setMsg(null)
    try {
      await save.mutateAsync({ dayNumber, title: title.trim() || `Day ${dayNumber}`, youtubeUrl: url.trim() })
      setMsg('Saved')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="grid gap-2 border-t border-border py-3 first:border-t-0 sm:grid-cols-[4rem_1fr_1.4fr_auto] sm:items-center">
      <span className="text-sm font-medium text-muted-foreground">Day {dayNumber}</span>
      <Input placeholder="Title, e.g. Time management" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder="YouTube link" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
    </div>
  )
}

function ProgressTable({ enabled }: { enabled: boolean }) {
  const { data, isPending, isError, error } = useSkillsTrainingProgressQuery(enabled)
  if (!enabled) return null
  return (
    <div className="surface-elevated p-5">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-4 text-primary" />
        <h2 className="font-semibold text-foreground">Team progress</h2>
      </div>
      {isPending ? <LoadingState label="Loading progress..." /> : null}
      {isError ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p> : null}
      {data && data.members.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : null}
      {data && data.members.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ds-caption uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2">Member</th>
                <th className="px-2 py-2">Done</th>
                <th className="px-2 py-2">Last watched</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user_id} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{m.fbo_id}</p>
                  </td>
                  <td className="px-2 py-2">
                    {m.available ? (
                      <span className={cn(m.completed_days >= data.total_days && data.total_days > 0 && 'font-semibold text-emerald-600 dark:text-emerald-400')}>
                        {m.completed_days}/{data.total_days}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">In onboarding</span>
                    )}
                  </td>
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

export function SkillsTrainingPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const { data, isPending, isError, error, refetch } = useSkillsTrainingQuery()
  const [openDay, setOpenDay] = useState<number | null>(null)
  const isAdmin = me?.role === 'admin'
  const canSeeProgress = me?.role === 'admin' || me?.role === 'leader'

  useEffect(() => {
    if (!data || openDay !== null) return
    const next = data.days.find((d) => d.unlocked && !d.completed)
    if (next) setOpenDay(next.day_number)
  }, [data, openDay])

  const percent = data && data.total_days > 0 ? Math.round((data.completed_days / data.total_days) * 100) : 0

  return (
    <div className="max-w-4xl space-y-5">
      <div className="surface-elevated p-5 md:p-6">
        <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
          <Sprout className="size-3.5" />
          Skills
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Personal development and skills lessons to watch alongside your daily work. One new lesson opens each
          day after you finish the previous one.
        </p>
        {data && data.available && data.total_days > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-ds-caption text-muted-foreground">
              <span>
                {data.completed_days} of {data.total_days} done
              </span>
              <span>{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <div className="surface-elevated p-4">
          <LoadingState label="Loading skills training..." />
        </div>
      ) : null}
      {isError ? (
        <ErrorState
          title="Could not load skills training"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && !data.available ? (
        <EmptyState
          title="Opens after onboarding"
          description="Finish your 7-day onboarding training to unlock the app. Skills training starts right after that."
        />
      ) : null}

      {data && data.available && data.days.length === 0 && !isAdmin ? (
        <EmptyState title="Coming soon" description="Skills lessons have not been added yet." />
      ) : null}

      {data && data.available && data.days.length > 0 ? (
        <div className="space-y-3">
          {data.days.map((day) => (
            <DayCard
              key={day.day_number}
              day={day}
              open={openDay === day.day_number}
              onToggle={() => setOpenDay((cur) => (cur === day.day_number ? -1 : day.day_number))}
            />
          ))}
        </div>
      ) : null}

      {isAdmin && data ? (
        <div className="surface-elevated p-5">
          <h2 className="font-semibold text-foreground">Manage lessons</h2>
          <p className="mb-2 mt-1 text-sm text-muted-foreground">
            Add a title and an unlisted YouTube link for each day. Members only see days that have been saved.
          </p>
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1).map((n) => (
            <AdminDayEditor key={n} dayNumber={n} day={data.days.find((d) => d.day_number === n)} />
          ))}
        </div>
      ) : null}

      <ProgressTable enabled={canSeeProgress} />
    </div>
  )
}
