import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 text-ds-caption font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-muted text-muted-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive/20 text-destructive',
        primary:
          'border-transparent bg-primary/15 text-primary',
        success:
          'border-transparent bg-success/15 text-success',
        warning:
          'border-transparent bg-warning/15 text-warning',
        danger:
          'border-transparent bg-destructive/15 text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge }
