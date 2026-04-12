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
      'relative flex w-full flex-col gap-2 rounded-lg border px-4 py-3 text-foreground sm:flex-row sm:items-center',
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
    className={cn('flex-1 text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertDescription }
