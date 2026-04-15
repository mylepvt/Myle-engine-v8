import { 
  FileQuestion, 
  Search, 
  Users, 
  Bell,
  TrendingUp,
  Wallet,
  Award,
  FolderOpen,
  Zap,
  type LucideIcon
} from 'lucide-react'
import * as React from 'react'

import { PremiumButton, GradientButton } from '@/components/ui/button-premium'
import { cn } from '@/lib/utils'

type EmptyStateVariant = 
  | 'default'
  | 'leads'
  | 'search'
  | 'notifications'
  | 'analytics'
  | 'wallet'
  | 'achievements'
  | 'files'
  | 'tasks'

interface EmptyStatePremiumProps {
  variant?: EmptyStateVariant
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
  icon?: LucideIcon
  children?: React.ReactNode
}

const iconMap: Record<EmptyStateVariant, LucideIcon> = {
  default: FileQuestion,
  leads: Users,
  search: Search,
  notifications: Bell,
  analytics: TrendingUp,
  wallet: Wallet,
  achievements: Award,
  files: FolderOpen,
  tasks: Zap,
}

const defaultMessages: Record<EmptyStateVariant, { title: string; description: string }> = {
  default: {
    title: 'Nothing here yet',
    description: 'Get started by creating your first item',
  },
  leads: {
    title: 'No leads yet',
    description: 'Start building your pipeline by adding your first lead.',
  },
  search: {
    title: 'No results found',
    description: 'Try adjusting your search or filters',
  },
  notifications: {
    title: 'All caught up!',
    description: 'You have no new notifications',
  },
  analytics: {
    title: 'No data yet',
    description: 'Data will appear once you start using the platform',
  },
  wallet: {
    title: 'No transactions',
    description: 'Your wallet activity will show up here',
  },
  achievements: {
    title: 'No achievements yet',
    description: 'Complete tasks to unlock achievements',
  },
  files: {
    title: 'No files',
    description: 'Upload your first file to get started',
  },
  tasks: {
    title: 'No pending tasks',
    description: "You're all caught up. Great job.",
  },
}

const EmptyStatePremium = ({
  variant = 'default',
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  className,
  icon: CustomIcon,
  children,
}: EmptyStatePremiumProps) => {
  const Icon = CustomIcon || iconMap[variant]
  const messages = defaultMessages[variant]

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl',
        'bg-gradient-to-b from-surface to-background',
        'border border-border/50',
        'px-8 py-12 text-center',
        'animate-fade-in',
        className
      )}
    >
      {/* Icon Container with gradient background */}
      <div
        className={cn(
          'mb-6 flex h-20 w-20 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-primary/20 to-accent/10',
          'transition-[box-shadow,opacity] duration-200 hover:opacity-95 hover:shadow-md'
        )}
      >
        <Icon className="h-10 w-10 text-primary" strokeWidth={1.5} />
      </div>

      {/* Title */}
      <h3 className="font-heading text-xl font-semibold text-foreground">
        {title || messages.title}
      </h3>

      {/* Description */}
      <p className="mt-2 max-w-sm text-ds-body text-muted-foreground">
        {description || messages.description}
      </p>

      {/* Actions */}
      {(actionLabel || children) && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {children}
          
          {actionLabel && onAction && (
            <GradientButton onClick={onAction} size="lg">
              {actionLabel}
            </GradientButton>
          )}
          
          {secondaryAction && (
            <PremiumButton
              variant="ghost"
              onClick={secondaryAction.onClick}
              className="text-muted-foreground hover:text-foreground"
            >
              {secondaryAction.label}
            </PremiumButton>
          )}
        </div>
      )}
    </div>
  )
}

// Specialized empty states for common scenarios

const NoLeadsEmptyState = (props: Omit<EmptyStatePremiumProps, 'variant'>) => (
  <EmptyStatePremium variant="leads" {...props} />
)

const NoSearchResultsEmptyState = (props: Omit<EmptyStatePremiumProps, 'variant'>) => (
  <EmptyStatePremium variant="search" {...props} />
)

const NoNotificationsEmptyState = (props: Omit<EmptyStatePremiumProps, 'variant'>) => (
  <EmptyStatePremium variant="notifications" {...props} />
)

const NoAnalyticsEmptyState = (props: Omit<EmptyStatePremiumProps, 'variant'>) => (
  <EmptyStatePremium variant="analytics" {...props} />
)

export {
  EmptyStatePremium,
  NoLeadsEmptyState,
  NoSearchResultsEmptyState,
  NoNotificationsEmptyState,
  NoAnalyticsEmptyState,
}
export type { EmptyStatePremiumProps, EmptyStateVariant }
