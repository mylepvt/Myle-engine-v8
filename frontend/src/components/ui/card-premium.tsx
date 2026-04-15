import * as React from 'react'

import { cn } from '@/lib/utils'

// Premium Card with lift animation and enhanced shadow
const PremiumCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    hoverLift?: boolean
    glowOnHover?: boolean
    gradientBorder?: boolean
  }
>(({ className, hoverLift = true, glowOnHover = false, gradientBorder = false, ...props }, ref) => {
  if (gradientBorder) {
    return (
      <div
        className={cn(
          'rounded-[16px] p-[1px]',
          'bg-gradient-to-br from-primary via-accent to-primary/50',
          'transition-all duration-300',
          hoverLift && 'hover:shadow-premium-hover',
          className
        )}
      >
        <div
          ref={ref}
          className={cn(
            'rounded-[15px] bg-card p-5',
            'transition-all duration-200'
          )}
          {...props}
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[16px] border border-border bg-card p-5',
        'shadow-premium',
        'transition-all duration-200 ease-out',
        hoverLift && [
          'hover:-translate-y-1',
          'hover:shadow-premium-hover',
        ],
        glowOnHover && 'hover:shadow-[0_0_30px_rgba(84,101,255,0.15)]',
        className
      )}
      {...props}
    />
  )
})
PremiumCard.displayName = 'PremiumCard'

// Card Header with better spacing and typography
const PremiumCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 pb-4', className)}
    {...props}
  />
))
PremiumCardHeader.displayName = 'PremiumCardHeader'

// Card Title with enhanced typography
const PremiumCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'font-heading text-lg font-semibold leading-tight tracking-tight text-foreground',
      className
    )}
    {...props}
  />
))
PremiumCardTitle.displayName = 'PremiumCardTitle'

// Card Description
const PremiumCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
PremiumCardDescription.displayName = 'PremiumCardDescription'

// Card Content with consistent padding
const PremiumCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('pt-0', className)} {...props} />
))
PremiumCardContent.displayName = 'PremiumCardContent'

// Card Footer with action buttons
const PremiumCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center justify-between pt-4', className)}
    {...props}
  />
))
PremiumCardFooter.displayName = 'PremiumCardFooter'

// Metric Card for dashboards
interface MetricCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'flat'
  className?: string
}

const MetricCard = ({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  trend,
  className,
}: MetricCardProps) => {
  const changeStyles = {
    positive: 'text-emerald-500',
    negative: 'text-red-500',
    neutral: 'text-muted-foreground',
  }

  const trendIcons = {
    up: '↑',
    down: '↓',
    flat: '→',
  }

  return (
    <PremiumCard className={className}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-3xl font-bold tracking-tight text-foreground animate-count-up">
              {value}
            </span>
            {change && (
              <span className={cn('text-sm font-medium', changeStyles[changeType])}>
                {trend && trendIcons[trend]} {change}
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            {icon}
          </div>
        )}
      </div>
    </PremiumCard>
  )
}

// Action Card with CTA
interface ActionCardProps {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  icon?: React.ReactNode
  className?: string
}

const ActionCard = ({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: ActionCardProps) => {
  return (
    <PremiumCard className={cn('group', className)}>
      <button
        type="button"
        onClick={onAction}
        className="flex w-full cursor-pointer items-start gap-4 rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {icon ? (
          <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 p-3 text-primary transition-[box-shadow,opacity] duration-200 group-hover:opacity-95 group-hover:shadow-md">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          <h4 className="font-medium text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
          <span className="inline-block text-sm font-medium text-primary transition-colors group-hover:text-primary/85">
            {actionLabel} →
          </span>
        </div>
      </button>
    </PremiumCard>
  )
}

export {
  PremiumCard,
  PremiumCardHeader,
  PremiumCardTitle,
  PremiumCardDescription,
  PremiumCardContent,
  PremiumCardFooter,
  MetricCard,
  ActionCard,
}
