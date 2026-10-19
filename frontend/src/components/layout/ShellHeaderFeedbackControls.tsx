import { Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'

export function ShellHeaderFeedbackControls() {
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)
  const theme = useUiFeedbackStore((s) => s.theme)
  const cycleTheme = useUiFeedbackStore((s) => s.cycleTheme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)
  const toggleSound = useUiFeedbackStore((s) => s.toggleSound)
  const isDark = theme === 'dark'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        'max-md:gap-0',
        'md:gap-0.5',
      )}
    >
      <button
        type="button"
        onClick={cycleTheme}
        className="press flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-md:size-9 [@media(pointer:coarse)]:size-11 max-md:[@media(pointer:coarse)]:size-10"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
      </button>

      <button
        type="button"
        onClick={toggleSound}
        data-no-tap-sound
        className="press flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-md:size-9 [@media(pointer:coarse)]:size-11 max-md:[@media(pointer:coarse)]:size-10"
        title={soundEnabled ? 'Mute app sounds' : 'Unmute app sounds'}
        aria-label={soundEnabled ? 'Mute app sounds' : 'Unmute app sounds'}
        aria-pressed={soundEnabled}
      >
        {soundEnabled ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
      </button>

      
      <div
        className="hidden h-7 items-center gap-1 rounded-full bg-muted px-2.5 tabular-nums text-muted-foreground sm:flex"
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
