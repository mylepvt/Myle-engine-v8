import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // Myle status pill: rounded-full, 20px tall, 11px semibold, tint fill + ink text.
  'inline-flex h-5 items-center whitespace-nowrap rounded-full border border-transparent px-2 text-ds-micro font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/15 text-destructive-ink',
        primary: 'bg-primary/15 text-accent-foreground',
        success: 'bg-success/15 text-success-ink',
        warning: 'bg-warning/15 text-warning-ink',
        danger: 'bg-destructive/15 text-destructive-ink',
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
