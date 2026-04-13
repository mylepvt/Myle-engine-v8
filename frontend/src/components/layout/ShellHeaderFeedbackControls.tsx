import { Layers2, Monitor, Moon, Sparkles, Sun, Vibrate, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { browserSupportsVibration } from '@/lib/haptics'
import { primeAudioContextSync } from '@/lib/ui-sounds'
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
  const hapticsEnabled = useUiFeedbackStore((s) => s.hapticsEnabled)
  const toggleHaptics = useUiFeedbackStore((s) => s.toggleHaptics)
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)

  const { label, Icon } = themeMeta[theme] ?? themeMeta.dark

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        'max-md:gap-0',
        'md:gap-0.5 md:rounded-lg md:border md:border-border/50 md:bg-muted/25 md:p-0.5',
      )}
    >
      <div role="group" aria-label="Theme">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 md:size-8"
          aria-label={`Theme: ${label}. Tap to cycle light → dark → system → glass`}
          title={`${label} · tap for next`}
          onClick={() => cycleTheme()}
        >
          <Icon className="size-[1.05rem] md:size-4" aria-hidden />
        </Button>
      </div>
      <div className="hidden max-w-[4rem] truncate text-[0.65rem] leading-tight text-muted-foreground xl:block">
        <span className="font-medium text-foreground/90">{label}</span>
        <span className="block text-[0.58rem] opacity-75">Tap · cycle</span>
      </div>
      <div className="mx-0 hidden h-6 w-px bg-border/70 md:mx-0.5 md:block" aria-hidden />

      {/* Sound toggle */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 md:size-8"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Mute UI sounds' : 'Enable UI sounds'}
        title={soundEnabled ? 'Mute UI sounds' : 'Enable UI sounds'}
        onClick={() => {
          primeAudioContextSync()
          toggleSound()
        }}
      >
        {soundEnabled ? (
          <Volume2 className="size-[1.05rem] md:size-4" />
        ) : (
          <VolumeX className="size-[1.05rem] md:size-4 opacity-50" />
        )}
      </Button>

      {/* Haptics toggle */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 md:size-8"
        aria-pressed={hapticsEnabled}
        aria-label={hapticsEnabled ? 'Disable haptics' : 'Enable haptics'}
        title={
          !browserSupportsVibration()
            ? 'Vibration not available in this browser (iPhone Safari has no web haptics — use sound)'
            : hapticsEnabled
              ? 'Haptics on'
              : 'Haptics off'
        }
        onClick={() => toggleHaptics()}
      >
        <Vibrate className={cn('size-[1.05rem] md:size-4', !hapticsEnabled && 'opacity-40')} />
      </Button>

      {/* Satisfaction points */}
      <div
        className="hidden items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums text-muted-foreground sm:flex"
        title="Points from UI interactions (local only)"
      >
        <Sparkles className="size-3 shrink-0 text-chart-4" aria-hidden />
        <span className="text-[0.68rem] font-semibold text-foreground/80">
          {satisfactionPoints > 999
            ? `${(satisfactionPoints / 1000).toFixed(1)}k`
            : satisfactionPoints}
        </span>
      </div>
    </div>
  )
}
