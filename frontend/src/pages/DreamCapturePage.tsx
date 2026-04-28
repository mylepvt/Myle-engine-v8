import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = { title: string }

const CATEGORIES = [
  { value: 'income',       label: 'Income Goal',   icon: '💰', desc: 'Financial target, passive income' },
  { value: 'time_freedom', label: 'Time Freedom',  icon: '⏳', desc: 'More time for what matters' },
  { value: 'family',       label: 'Family',         icon: '👨‍👩‍👧', desc: 'Family, parents, kids' },
  { value: 'home',         label: 'Home',            icon: '🏠', desc: 'Own home, better living' },
  { value: 'travel',       label: 'Travel',          icon: '✈️', desc: 'Explore the world' },
  { value: 'business',     label: 'Own Business',   icon: '🏢', desc: 'Build something of your own' },
  { value: 'other',        label: 'Other',           icon: '⭐', desc: 'Something unique to you' },
]

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', ...opts })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error((b as { detail?: string }).detail ?? res.statusText)
  }
  return res.json()
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function DreamCapturePage({ title }: Props) {
  const qc = useQueryClient()

  const { data: dream, isPending } = useQuery<Record<string, unknown>>({
    queryKey: ['dreams', 'me'],
    queryFn: () => apiFetch('/api/v1/dreams/me'),
  })

  const { data: team, isPending: teamPending } = useQuery<unknown[]>({
    queryKey: ['dreams', 'team'],
    queryFn: () => apiFetch('/api/v1/dreams/team'),
  })

  const hasDream = dream && Object.keys(dream).length > 0

  const [category, setCategory] = useState(hasDream ? (dream?.category as string) : 'other')
  const [dreamText, setDreamText] = useState(hasDream ? (dream?.dream_text as string) : '')
  const [targetDate, setTargetDate] = useState(
    hasDream && dream?.target_date ? (dream.target_date as string) : '',
  )
  const [imageUrl, setImageUrl] = useState(hasDream && dream?.image_url ? (dream.image_url as string) : '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [editing, setEditing] = useState(!hasDream)

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/dreams/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          dream_text: dreamText,
          target_date: targetDate || null,
          image_url: imageUrl || null,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dreams'] })
      setError(null)
      setSuccess(true)
      setEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (e: Error) => {
      setError(e.message)
      setSuccess(false)
    },
  })

  const removeDream = useMutation({
    mutationFn: () => apiFetch('/api/v1/dreams/me', { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dreams'] })
      setDreamText('')
      setTargetDate('')
      setImageUrl('')
      setCategory('other')
      setEditing(true)
    },
  })

  // Sync form when dream loads for first time
  if (!isPending && hasDream && !editing && dreamText !== dream?.dream_text) {
    setCategory(dream.category as string)
    setDreamText(dream.dream_text as string)
    setTargetDate(dream.target_date ? (dream.target_date as string) : '')
    setImageUrl(dream.image_url ? (dream.image_url as string) : '')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

      {isPending ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !editing && hasDream ? (
        // Dream display card
        <div className="surface-elevated rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden>
              {CATEGORIES.find((c) => c.value === dream.category)?.icon ?? '⭐'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {CATEGORIES.find((c) => c.value === dream.category)?.label ?? dream.category as string}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground leading-snug">
                {dream.dream_text as string}
              </p>
              {dream.target_date ? (
                <p className={cn(
                  'mt-1.5 text-sm font-medium',
                  daysUntil(dream.target_date as string) < 0 ? 'text-destructive' :
                  daysUntil(dream.target_date as string) < 90 ? 'text-amber-400' : 'text-muted-foreground',
                )}>
                  {daysUntil(dream.target_date as string) < 0
                    ? `${Math.abs(daysUntil(dream.target_date as string))} days overdue`
                    : daysUntil(dream.target_date as string) === 0
                    ? 'Today is the day!'
                    : `${daysUntil(dream.target_date as string)} days to go — ${dream.target_date as string}`}
                </p>
              ) : null}
              {dream.image_url ? (
                <a
                  href={dream.image_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-xs text-primary underline underline-offset-2"
                >
                  View vision board image
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Edit dream
            </button>
            <button
              type="button"
              onClick={() => removeDream.mutate()}
              disabled={removeDream.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        // Dream form
        <div className="surface-elevated rounded-2xl p-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            Your dream is your anchor. When motivation fades, it's the one thing that keeps you going.
          </p>

          {/* Category picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                    category === c.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background/50 text-muted-foreground hover:border-primary/40',
                  )}
                >
                  <span className="text-xl" aria-hidden>{c.icon}</span>
                  <span className="text-xs font-medium">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dream text */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Describe your dream
            </label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Apne parents ka ghar lena, bhai ki padhai, khud ka business..."
              value={dreamText}
              onChange={(e) => setDreamText(e.target.value)}
            />
          </div>

          {/* Target date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Target date (optional)
            </label>
            <input
              type="date"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          {/* Vision board image URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Vision board image URL (optional)
            </label>
            <input
              type="url"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-400">Dream saved.</p> : null}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={save.isPending || !dreamText.trim()}
              onClick={() => save.mutate()}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {save.isPending ? 'Saving…' : 'Save dream'}
            </button>
            {hasDream ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Team dreams (leader/admin) */}
      <div className="surface-elevated rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">Team Dreams</p>
        {teamPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : !team || (team as unknown[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No team dreams set yet.</p>
        ) : (
          <div className="space-y-3">
            {(team as Record<string, unknown>[]).map((d) => (
              <div key={d.user_id as number} className="flex items-start gap-3 rounded-xl border border-border/50 p-3">
                <span className="text-lg" aria-hidden>
                  {CATEGORIES.find((c) => c.value === d.category)?.icon ?? '⭐'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {d.member_name as string}
                    </p>
                    <span className="text-[0.6rem] text-muted-foreground shrink-0">{d.fbo_id as string}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.dream_text as string}</p>
                  {d.target_date ? (
                    <p className="text-[0.6rem] text-muted-foreground/60 mt-0.5">Target: {d.target_date as string}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
