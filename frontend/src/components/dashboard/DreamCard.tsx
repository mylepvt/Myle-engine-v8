import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<string, string> = {
  income:       '💰',
  time_freedom: '⏳',
  family:       '👨‍👩‍👧',
  home:         '🏠',
  travel:       '✈️',
  business:     '🏢',
  other:        '⭐',
}

async function fetchMyDream(): Promise<Record<string, unknown>> {
  const res = await fetch('/api/v1/dreams/me', { credentials: 'include' })
  if (!res.ok) throw new Error('failed')
  return res.json()
}

function daysUntil(iso: string): number | null {
  const target = new Date(iso)
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
  return diff
}

export function DreamCard() {
  const { data, isPending } = useQuery({
    queryKey: ['dreams', 'me'],
    queryFn: fetchMyDream,
    staleTime: 5 * 60 * 1000,
  })

  if (isPending) return null

  const hasDream = data && Object.keys(data).length > 0

  if (!hasDream) {
    return (
      <Link
        to="/dashboard/other/my-dream"
        className={cn(
          'flex items-center gap-3 rounded-[1.25rem] border border-dashed border-white/20',
          'bg-white/[0.04] px-4 py-3.5 transition hover:bg-white/[0.08]',
        )}
      >
        <span className="text-xl" aria-hidden>⭐</span>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/60">
            My Dream
          </p>
          <p className="text-sm text-blue-100/80">Set your dream — it fuels everything else</p>
        </div>
        <Sparkles className="ml-auto size-4 shrink-0 text-blue-100/40" aria-hidden />
      </Link>
    )
  }

  const icon = CATEGORY_ICONS[data.category as string] ?? '⭐'
  const days = data.target_date ? daysUntil(data.target_date as string) : null

  return (
    <Link
      to="/dashboard/other/my-dream"
      className={cn(
        'flex items-start gap-3 rounded-[1.25rem] border border-white/10',
        'bg-white/[0.06] px-4 py-3.5 transition hover:bg-white/[0.10]',
      )}
    >
      <span className="mt-0.5 text-xl" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-blue-100/60">
          My Dream
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium text-white leading-snug">
          {data.dream_text as string}
        </p>
        {days !== null ? (
          <p className={cn(
            'mt-1 text-[0.65rem]',
            days < 0 ? 'text-rose-400' : days < 90 ? 'text-amber-300' : 'text-blue-100/55',
          )}>
            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days}d to go`}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
