import * as React from 'react'

import { cn } from '@/lib/utils'

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(
      // Tinted card (callers add the tint, e.g. bg-warning/10); the border stays
      // transparent unless a caller colours it.
      'relative flex w-full flex-col gap-2 rounded-card border border-transparent px-4 py-3 text-foreground sm:flex-row sm:items-center sm:p-4',
      className,
    )}
    {...props}
  />
))
Alert.displayName = 'Alert'

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 text-ds-body', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertDescription }
