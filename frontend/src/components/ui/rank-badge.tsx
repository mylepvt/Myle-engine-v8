import { cn } from '@/lib/utils'

const PODIUM = [
  'bg-amber-400 text-amber-950 ring-amber-300/60', // gold
  'bg-slate-300 text-slate-900 ring-slate-200/60', // silver
  'bg-orange-400 text-orange-950 ring-orange-300/60', // bronze
] as const

/** Rank chip: gold / silver / bronze discs for the podium, a muted "#n" after that. */
export function RankBadge({ rank, size = 'md', className }: { rank: number; size?: 'md' | 'lg'; className?: string }) {
  const podium = rank >= 1 && rank <= 3 ? PODIUM[rank - 1] : null
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums',
        size === 'lg' ? 'size-10 text-ds-h3' : 'size-7 text-xs',
        podium ? cn('ring-2', podium) : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {podium ? rank : `#${rank}`}
    </span>
  )
}
