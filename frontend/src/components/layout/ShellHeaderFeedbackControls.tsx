import { Layers2, Monitor, Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUiFeedbackStore, type ThemePreference } from '@/stores/ui-feedback-store'

const themeMeta: Record<
  ThemePreference,
  { label: string; Icon: typeof Sun }
> = {
  light: { label: 'Light', Icon: Sun },
  dark: { label: 'Dark', Icon: Moon },
  system: { label: 'System', Icon: Monitor },
  transparent: { label: 'Glass', Icon: Layers2 },
}

export function ShellHeaderFeedbackControls() {
  const theme = useUiFeedbackStore((s) => s.theme)
  const cycleTheme = useUiFeedbackStore((s) => s.cycleTheme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)
  const toggleSound = useUiFeedbackStore((s) => s.toggleSound)
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)

  const { label, Icon } = themeMeta[theme] ?? themeMeta.dark

  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-0.5">
      <div role="group" aria-label="Theme">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Theme: ${label}. Tap to cycle light → dark → system → glass`}
          title={`${label} · tap for next`}
          onClick={() => cycleTheme()}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="hidden max-w-[4rem] truncate text-[0.65rem] leading-tight text-muted-foreground lg:block">
        <span className="font-medium text-foreground/90">{label}</span>
        <span className="block text-[0.58rem] opacity-75">Tap · cycle</span>
      </div>
      <div className="mx-0.5 h-6 w-px bg-border/80" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Mute UI sounds' : 'Enable UI sounds'}
        title={soundEnabled ? 'Mute UI sounds' : 'Enable UI sounds'}
        onClick={() => toggleSound()}
      >
        {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </Button>
      <div
        className={cn(
          'flex min-w-0 max-w-[5.5rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-ds-caption tabular-nums text-muted-foreground',
        )}
        title="Points from UI clicks (local only)"
      >
        <Sparkles className="size-3.5 shrink-0 text-chart-4" aria-hidden />
        <span className="truncate font-medium text-foreground">{satisfactionPoints}</span>
        <span className="hidden sm:inline">pts</span>
      </div>
    </div>
  )
}
