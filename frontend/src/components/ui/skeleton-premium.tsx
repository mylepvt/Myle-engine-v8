import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SkeletonPremiumProps {
  className?: string
  width?: string | number
  height?: string | number
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  shimmer?: boolean
}

const SkeletonPremium = ({
  className,
  width,
  height,
  variant = 'rounded',
  shimmer = true,
}: SkeletonPremiumProps) => {
  const style: CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'text' ? '1em' : undefined),
  }

  return (
    <div
      className={cn(
        shimmer ? 'animate-pulse' : '',
        'bg-muted/70',
        variant === 'circular' && 'rounded-full',
        variant === 'rounded' && 'rounded-lg',
        variant === 'rectangular' && 'rounded-none',
        variant === 'text' && 'rounded-md',
        className,
      )}
      style={style}
    />
  )
}

const CardSkeleton = () => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-ios-card">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        <SkeletonPremium width="40%" height={14} />
        <SkeletonPremium width="60%" height={32} />
        <SkeletonPremium width="30%" height={14} />
      </div>
      <SkeletonPremium variant="circular" width={40} height={40} />
    </div>
  </div>
)

const MetricCardSkeleton = () => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-ios-card">
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <SkeletonPremium width={80} height={14} />
        <SkeletonPremium width={100} height={36} />
        <SkeletonPremium width={60} height={14} />
      </div>
      <SkeletonPremium variant="circular" width={44} height={44} />
    </div>
  </div>
)

const ListItemSkeleton = () => (
  <div className="flex items-center gap-4 py-3">
    <SkeletonPremium variant="circular" width={40} height={40} />
    <div className="flex-1 space-y-2">
      <SkeletonPremium width="60%" height={14} />
      <SkeletonPremium width="40%" height={12} />
    </div>
    <SkeletonPremium width={84} height={32} />
  </div>
)

const TableRowSkeleton = ({ columns = 4 }: { columns?: number }) => (
  <div className="flex items-center gap-4 py-4">
    {Array.from({ length: columns }).map((_, i) => (
      <SkeletonPremium
        key={i}
        className="flex-1"
        height={i === 0 ? 40 : 16}
        variant={i === 0 ? 'circular' : 'rounded'}
      />
    ))}
  </div>
)

const PageHeaderSkeleton = () => (
  <div className="mb-8 space-y-4">
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonPremium width={200} height={32} />
        <SkeletonPremium width={280} height={16} />
      </div>
      <SkeletonPremium width={120} height={40} />
    </div>
  </div>
)

const StatsRowSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => (
      <MetricCardSkeleton key={i} />
    ))}
  </div>
)

const ContentSectionSkeleton = () => (
  <div className="space-y-4">
    <SkeletonPremium width="30%" height={24} />
    <div className="rounded-2xl border border-border bg-card p-4 shadow-ios-card">
      {Array.from({ length: 5 }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  </div>
)

const FullPageSkeleton = () => (
  <div className="space-y-8">
    <PageHeaderSkeleton />
    <StatsRowSkeleton />
    <div className="grid gap-8 lg:grid-cols-2">
      <ContentSectionSkeleton />
      <ContentSectionSkeleton />
    </div>
  </div>
)

const SidebarSkeleton = () => (
  <div className="space-y-2 px-2" aria-busy="true" aria-label="Loading navigation">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-11 animate-pulse rounded-[0.625rem] bg-muted/60" />
    ))}
  </div>
)

interface ShimmerTextProps {
  children: ReactNode
  className?: string
}

const ShimmerText = ({ children, className }: ShimmerTextProps) => (
  <p className={cn('animate-pulse text-muted-foreground', className)}>{children}</p>
)

interface LoadingStatePremiumProps {
  message?: string
  subMessage?: string
  className?: string
}

const LoadingStatePremium = ({
  message = 'Preparing your dashboard...',
  subMessage = 'Almost ready',
  className,
}: LoadingStatePremiumProps) => (
  <div className={cn('flex min-h-[300px] flex-col items-center justify-center space-y-4', className)}>
    <div className="relative">
      <div className="h-12 w-12 rounded-full border-4 border-primary/20" />
      <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
    <div className="space-y-1 text-center">
      <ShimmerText className="font-medium">{message}</ShimmerText>
      {subMessage ? <p className="text-sm text-muted-foreground/60">{subMessage}</p> : null}
    </div>
  </div>
)

export {
  SkeletonPremium,
  CardSkeleton,
  MetricCardSkeleton,
  ListItemSkeleton,
  TableRowSkeleton,
  PageHeaderSkeleton,
  StatsRowSkeleton,
  ContentSectionSkeleton,
  FullPageSkeleton,
  SidebarSkeleton,
  ShimmerText,
  LoadingStatePremium,
}
