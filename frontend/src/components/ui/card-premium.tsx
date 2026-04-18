import * as React from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PremiumCardProps = React.HTMLAttributes<HTMLDivElement> & {
  hoverLift?: boolean
  glowOnHover?: boolean
  gradientBorder?: boolean
}

/**
 * Backward-compatible premium card API that now composes the canonical Card component.
 * Keeps visual consistency and avoids maintaining two divergent card systems.
 */
const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  (
    {
      className,
      hoverLift = true,
      glowOnHover = false,
      gradientBorder = false,
      children,
      ...props
    },
    ref,
  ) => {
    const card = (
      <Card
        ref={ref}
        className={cn(
          hoverLift && 'transition-transform duration-200 hover:-translate-y-0.5',
          glowOnHover && 'hover:shadow-md',
          className,
        )}
        {...props}
      >
        {children}
      </Card>
    )

    if (!gradientBorder) return card

    return (
      <div className="rounded-2xl bg-gradient-to-br from-primary/50 via-accent/40 to-primary/20 p-px">
        {card}
      </div>
    )
  },
)
PremiumCard.displayName = 'PremiumCard'

const PremiumCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <CardHeader ref={ref} className={cn(className)} {...props} />
))
PremiumCardHeader.displayName = 'PremiumCardHeader'

const PremiumCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <CardTitle ref={ref} className={cn(className)} {...props} />
))
PremiumCardTitle.displayName = 'PremiumCardTitle'

const PremiumCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <CardDescription ref={ref} className={cn(className)} {...props} />
))
PremiumCardDescription.displayName = 'PremiumCardDescription'

const PremiumCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <CardContent ref={ref} className={cn(className)} {...props} />
))
PremiumCardContent.displayName = 'PremiumCardContent'

const PremiumCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <CardFooter ref={ref} className={cn(className)} {...props} />
))
PremiumCardFooter.displayName = 'PremiumCardFooter'

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
  } as const

  const trendIcons = {
    up: '↑',
    down: '↓',
    flat: '→',
  } as const

  return (
    <PremiumCard className={className}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-3xl font-bold tracking-tight text-foreground">
              {value}
            </span>
            {change ? (
              <span className={cn('text-sm font-medium', changeStyles[changeType])}>
                {trend ? trendIcons[trend] : null} {change}
              </span>
            ) : null}
          </div>
        </div>
        {icon ? <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div> : null}
      </div>
    </PremiumCard>
  )
}

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
}: ActionCardProps) => (
  <PremiumCard className={cn('group', className)}>
    <button
      type="button"
      onClick={onAction}
      className="flex w-full cursor-pointer items-start gap-4 rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {icon ? (
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 p-3 text-primary">
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
