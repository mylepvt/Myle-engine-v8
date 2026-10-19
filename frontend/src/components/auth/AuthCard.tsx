import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { MyleBrandTile } from '@/components/brand/MyleSidebarMark'
import { cn } from '@/lib/utils'

type AuthCardProps = {
  /** Header layout: centered brand tile (login) or tile beside the titles (register). */
  variant: 'center' | 'split'
  /** Kept for callers; the header shows the Myle brand tile. */
  icon?: LucideIcon
  /** Override the brand tile with a custom node. */
  iconNode?: ReactNode
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  /** Optional class on outer card */
  className?: string
}

/** Myle Ledger auth card: a solid card on the ambient backdrop, brand tile, then the form. */
export function AuthCard({
  variant,
  iconNode,
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardProps) {
  const mark = iconNode ?? <MyleBrandTile className="size-14 rounded-2xl text-ds-h1" />
  return (
    <div className={cn('card w-full max-w-[min(100%,26rem)] overflow-hidden', className)}>
      {variant === 'center' ? (
        <div className="px-6 pt-8 text-center sm:px-8">
          <div className="mx-auto mb-4 flex w-fit">{mark}</div>
          <h1 className="text-ds-h1 text-foreground">{title}</h1>
          <p className="mt-1 text-ds-body text-muted-foreground">{subtitle}</p>
        </div>
      ) : (
        <div className="flex items-center gap-4 px-5 pt-6 sm:px-7">
          {mark}
          <div className="min-w-0 flex-1 text-left">
            <h1 className="text-ds-h1 text-foreground">{title}</h1>
            <p className="mt-0.5 text-ds-body text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      )}

      <div className="space-y-5 px-5 py-6 sm:px-7">{children}</div>

      {footer ? (
        <div className="border-t border-border px-5 py-4 text-center sm:px-7">{footer}</div>
      ) : null}
    </div>
  )
}
