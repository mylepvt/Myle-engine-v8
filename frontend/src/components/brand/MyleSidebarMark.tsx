import { cn } from '@/lib/utils'

type Props = {
  className?: string
}

/** SaaS-style “M” mark + wordmark for dashboard chrome. */
export function MyleSidebarMark({ className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_srgb,var(--palette-cyan-dull)_40%,var(--palette-blue)_60%)] shadow-[0_2px_12px_rgba(84,101,255,0.35)] ring-1 ring-white/10"
        aria-hidden
      >
        <span className="font-heading text-[1.125rem] font-bold leading-none tracking-tight text-primary-foreground drop-shadow-sm">
          M
        </span>
      </span>
      <span className="font-heading text-[1.0625rem] font-semibold tracking-tight text-foreground">
        Myle
      </span>
    </span>
  )
}
