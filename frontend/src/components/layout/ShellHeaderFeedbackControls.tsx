import { Monitor, Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUiFeedbackStore, type ThemePreference } from '@/stores/ui-feedback-store'

const themes: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light mode', Icon: Sun },
  { value: 'dark', label: 'Dark mode', Icon: Moon },
  { value: 'system', label: 'Match system', Icon: Monitor },
]

export function ShellHeaderFeedbackControls() {
  const theme = useUiFeedbackStore((s) => s.theme)
  const setTheme = useUiFeedbackStore((s) => s.setTheme)
  const cycleTheme = useUiFeedbackStore((s) => s.cycleTheme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)
  const toggleSound = useUiFeedbackStore((s) => s.toggleSound)
  const satisfactionPoints = useUiFeedbackStore((s) => s.satisfactionPoints)

  return (
    <div
      data-ui-silent
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5"
    >
      <div className="flex md:hidden" role="group" aria-label="Theme">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Theme: ${theme}. Tap to switch`}
          title="Switch light / dark / system"
          onClick={() => cycleTheme()}
        >
          {theme === 'light' ? (
            <Sun className="size-4" aria-hidden />
          ) : theme === 'dark' ? (
            <Moon className="size-4" aria-hidden />
          ) : (
            <Monitor className="size-4" aria-hidden />
          )}
        </Button>
      </div>
      <div className="hidden items-center md:flex" role="group" aria-label="Theme">
        {themes.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'size-8',
              theme === value && 'bg-background text-foreground shadow-sm ring-1 ring-border',
            )}
            aria-pressed={theme === value}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        ))}
      </div>
      <div className="mx-0.5 h-6 w-px bg-border/80" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Mute UI sounds' : 'Enable UI sounds'}
        title={soundEnabled ? 'Mute satisfaction sounds' : 'Enable satisfaction sounds'}
        onClick={() => toggleSound()}
      >
        {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </Button>
      <div
        className="flex min-w-0 max-w-[5.5rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-ds-caption tabular-nums text-muted-foreground"
        title="Points from UI clicks (local only)"
      >
        <Sparkles className="size-3.5 shrink-0 text-chart-4" aria-hidden />
        <span className="truncate font-medium text-foreground">{satisfactionPoints}</span>
        <span className="hidden sm:inline">pts</span>
      </div>
    </div>
  )
}
