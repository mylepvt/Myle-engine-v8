import { AlertTriangle, Award, Bell, FolderOpen, Inbox, type LucideIcon, Search, TrendingUp, Users, Wallet, Zap } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateVariant =
  | 'default'
  | 'leads'
  | 'search'
  | 'notifications'
  | 'analytics'
  | 'wallet'
  | 'achievements'
  | 'files'
  | 'tasks'

const VARIANT_ICONS: Record<EmptyStateVariant, LucideIcon> = {
  default: Inbox,
  leads: Users,
  search: Search,
  notifications: Bell,
  analytics: TrendingUp,
  wallet: Wallet,
  achievements: Award,
  files: FolderOpen,
  tasks: Zap,
}

type EmptyStateProps = {
  title: string
  description?: string
  /** Picks the icon; override with `icon`. */
  variant?: EmptyStateVariant
  icon?: LucideIcon
  className?: string
  children?: React.ReactNode
}

/** The one "nothing here" screen used across the app. */
export function EmptyState({
  title,
  description,
  variant = 'default',
  icon,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'card flex flex-col items-center justify-center px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {React.createElement(icon ?? VARIANT_ICONS[variant], { className: 'size-6', strokeWidth: 1.75, 'aria-hidden': true })}
      </div>
      <p className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

type InlineEmptyProps = {
  children: React.ReactNode
  icon?: LucideIcon
  /** Optional one action, e.g. a small button or link. */
  action?: React.ReactNode
  className?: string
}

/** "Nothing here" inside a card: small icon, one short line, optional action. */
export function InlineEmpty({ children, icon = Inbox, action, className }: InlineEmptyProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-6 text-center', className)}>
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {React.createElement(icon, { className: 'size-4', strokeWidth: 1.75, 'aria-hidden': true })}
      </span>
      <p className="max-w-xs text-ds-caption text-muted-foreground">{children}</p>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

type LoadingStateProps = {
  label?: string
  className?: string
}

export function LoadingState({ label, className }: LoadingStateProps) {
  // Content-shaped shimmer placeholders (SaaS feel) instead of a bare spinner —
  // reads as "the page is building" and avoids the empty/blank flash.
  return (
    <div
      className={cn('space-y-3 py-2', className)}
      role="status"
      aria-busy
      aria-live="polite"
    >
      <span className="sr-only">{label ?? 'Loading…'}</span>
      <div className="h-8 w-44 animate-pulse rounded-full bg-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 w-full animate-pulse rounded-card bg-muted" />
      ))}
    </div>
  )
}

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'card flex flex-col items-center justify-center px-6 py-8 text-center',
        className,
      )}
      role="alert"
    >
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive-ink">
        <AlertTriangle className="size-5" strokeWidth={1.9} aria-hidden />
      </span>
      <p className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        {message}
      </p>
      {onRetry ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
