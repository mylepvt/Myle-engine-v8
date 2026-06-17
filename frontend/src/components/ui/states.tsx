import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  title: string
  description?: string
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded border border-dashed border-border bg-surface/30 px-6 py-10 text-center',
        className,
      )}
    >
      <p className="font-heading text-ds-h3 text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-ds-body text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
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
      <div className="skeleton-shimmer h-8 w-44 rounded-lg bg-foreground/10" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-shimmer h-20 w-full rounded-xl bg-foreground/10" />
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
        'flex flex-col items-center justify-center rounded border border-destructive/35 bg-destructive/10 px-6 py-8 text-center',
        className,
      )}
      role="alert"
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-ds-body text-muted-foreground">
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
