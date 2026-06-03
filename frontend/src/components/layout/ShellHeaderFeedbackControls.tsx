import { Moon, Sparkles, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'

export function ShellHeaderFeedbackControls() {
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)
  const theme = useUiFeedbackStore((s) => s.theme)
  const cycleTheme = useUiFeedbackStore((s) => s.cycleTheme)
  const isDark = theme === 'dark'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        'max-md:gap-0',
        'md:gap-0.5 md:rounded md:border md:border-border/50 md:bg-muted/25 md:p-0.5',
      )}
    >
      <button
        type="button"
        onClick={cycleTheme}
        className="flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
      </button>

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
