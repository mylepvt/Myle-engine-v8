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
  gradientBorder?: boolean
}

const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, hoverLift = false, gradientBorder = false, children, ...props }, ref) => {
    const card = (
      <Card ref={ref} className={cn(className, hoverLift && 'transition-transform hover:-translate-y-0.5')} {...props}>
        {children}
      </Card>
    )

    if (!gradientBorder) return card

    return (
      <div className="rounded border border-primary/30 p-px">
        {card}
      </div>
    )
  },
)
PremiumCard.displayName = 'PremiumCard'

const PremiumCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <CardHeader ref={ref} className={cn(className)} {...props} />,
)
PremiumCardHeader.displayName = 'PremiumCardHeader'

const PremiumCardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <CardTitle ref={ref} className={cn(className)} {...props} />,
)
PremiumCardTitle.displayName = 'PremiumCardTitle'

const PremiumCardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <CardDescription ref={ref} className={cn(className)} {...props} />,
)
PremiumCardDescription.displayName = 'PremiumCardDescription'

const PremiumCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <CardContent ref={ref} className={cn(className)} {...props} />,
)
PremiumCardContent.displayName = 'PremiumCardContent'

const PremiumCardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <CardFooter ref={ref} className={cn(className)} {...props} />,
)
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

const MetricCard = ({ title, value, change, changeType = 'neutral', icon, trend, className }: MetricCardProps) => {
  const changeStyles = {
    positive: 'text-success',
    negative: 'text-destructive',
    neutral: 'text-muted-foreground',
  } as const

  const trendIcons = { up: '↑', down: '↓', flat: '→' } as const

  return (
    <PremiumCard className={className}>
      <div className="px-4 py-3 md:px-5 md:py-4 flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-ds-caption text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-ds-h1 text-foreground">{value}</span>
            {change ? (
              <span className={cn('text-ds-caption font-medium', changeStyles[changeType])}>
                {trend ? trendIcons[trend] : null} {change}
              </span>
            ) : null}
          </div>
        </div>
        {icon ? <div className="shrink-0 rounded bg-primary/10 p-2 text-primary">{icon}</div> : null}
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

const ActionCard = ({ title, description, actionLabel, onAction, icon, className }: ActionCardProps) => (
  <PremiumCard className={cn('group', className)}>
    <button
      type="button"
      onClick={onAction}
      className="flex w-full cursor-pointer items-start gap-4 px-4 py-3 md:px-5 md:py-4 rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {icon ? (
        <div className="shrink-0 rounded bg-primary/10 p-2.5 text-primary">{icon}</div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h4 className="text-ds-h3 text-foreground">{title}</h4>
        <p className="text-ds-body text-muted-foreground">{description}</p>
        <span className="inline-block text-ds-body font-medium text-primary transition-colors group-hover:text-primary/85">
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
