import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type AuthCardProps = {
  /** Header visual: centered icon (login) or split icon + titles (register). */
  variant: 'center' | 'split'
  icon: LucideIcon
  /** Override the icon entirely with a custom node (e.g. branded SVG). */
  iconNode?: ReactNode
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  /** Optional class on outer card */
  className?: string
}

export function AuthCard({
  variant,
  icon: Icon,
  iconNode,
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        'w-full max-w-[min(100%,26rem)] overflow-hidden rounded-[0.875rem] border border-border',
        'bg-card shadow-ios-card',
        className,
      )}
    >
      <div
        className={cn(
          'relative',
          'bg-gradient-to-br from-black via-[#020712] to-[#0a1328]',
          variant === 'center' ? 'px-6 pb-8 pt-9 text-center' : 'px-5 pb-6 pt-6 sm:px-6',
        )}
      >
        {/* subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          aria-hidden
        />
        {variant === 'center' ? (
          <>
            <div className="mx-auto mb-4 flex size-[4.25rem] items-center justify-center rounded-full border border-primary-foreground/25 bg-primary-foreground/15 shadow-inner backdrop-blur-sm">
              {iconNode ?? <Icon className="size-9 text-primary-foreground" aria-hidden />}
            </div>
            <h1 className="font-heading text-xl font-bold tracking-tight text-primary-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-primary-foreground/88">
              {subtitle}
            </p>
          </>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-primary-foreground/25 bg-primary-foreground/15 shadow-inner">
              <Icon className="size-7 text-primary-foreground" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5 text-left">
              <h1 className="font-heading text-lg font-bold leading-snug tracking-tight text-primary-foreground sm:text-xl">
                {title}
              </h1>
              <p className="mt-1 text-sm font-medium leading-relaxed text-primary-foreground/88">
                {subtitle}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5 bg-card px-5 py-6 sm:px-7">{children}</div>

      {footer ? (
        <div className="border-t border-border bg-card/95 px-5 py-4 text-center sm:px-7">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
