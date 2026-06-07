import * as React from 'react'

import { cn } from '@/lib/utils'

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded bg-foreground/10', className)}
      {...props}
    />
  )
}

export { Skeleton }
