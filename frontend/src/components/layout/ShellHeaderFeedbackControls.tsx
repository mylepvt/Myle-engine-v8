import { Moon, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'

export function ShellHeaderFeedbackControls() {
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        'max-md:gap-0',
        'md:gap-0.5 md:rounded md:border md:border-border/50 md:bg-muted/25 md:p-0.5',
      )}
    >
      <div className="flex size-8 items-center justify-center text-muted-foreground" title="Dark mode">
        <Moon className="size-4" aria-hidden />
      </div>

      <div className="mx-0 hidden h-6 w-px bg-border/70 md:mx-0.5 md:block" aria-hidden />

      <div
        className="hidden items-center gap-1 rounded px-1.5 py-0.5 tabular-nums text-muted-foreground sm:flex"
        title="Points from UI interactions (local only)"
      >
        <Sparkles className="size-3 shrink-0 text-chart-4" aria-hidden />
        <span className="text-ds-caption font-semibold text-foreground/80">
          {satisfactionPoints > 999
            ? `${(satisfactionPoints / 1000).toFixed(1)}k`
            : satisfactionPoints}
        </span>
      </div>
    </div>
  )
}
