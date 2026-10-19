import { cn } from '@/lib/utils'

type Props = {
  className?: string
}

/** The “M” tile on its own (sidebar mark, auth screens). Size it via `className`. */
export function MyleBrandTile({ className }: Props) {
  return (
    <span
      className={cn(
        'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-primary to-[color-mix(in_srgb,var(--palette-cyan-dull)_40%,var(--palette-blue)_60%)] text-ds-h3 shadow-[0_2px_12px_rgba(84,101,255,0.35)] ring-1 ring-white/10',
        className,
      )}
      aria-hidden
    >
      <span className="font-heading font-bold leading-none tracking-tight text-primary-foreground drop-shadow-sm">
        M
      </span>
    </span>
  )
}

/** SaaS-style “M” mark + wordmark for dashboard chrome. */
export function MyleSidebarMark({ className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MyleBrandTile />
      <span className="font-heading text-ds-h3 font-semibold tracking-tight text-foreground">
        Myle
      </span>
    </span>
  )
}
