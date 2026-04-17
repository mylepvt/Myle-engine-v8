import { Loader2 } from 'lucide-react'
import * as React from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Backward-compatible premium aliases that now sit on top of the canonical button system.
 * This keeps existing imports working while avoiding a second divergent UI style.
 */
export type PremiumButtonProps = ButtonProps & {
  isLoading?: boolean
  loadingText?: string
  showRipple?: boolean
  glowOnHover?: boolean
}

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  (
    {
      className,
      isLoading = false,
      loadingText,
      showRipple: _showRipple = true,
      glowOnHover = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <Button
      ref={ref}
      className={cn(
        'relative overflow-hidden',
        glowOnHover && 'hover:shadow-md',
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-2', isLoading && 'opacity-0')}>
        {children}
      </span>
      {isLoading ? (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {loadingText ? <span className="text-sm">{loadingText}</span> : null}
        </span>
      ) : null}
    </Button>
  ),
)
PremiumButton.displayName = 'PremiumButton'

export { PremiumButton }

export type GradientButtonProps = Omit<PremiumButtonProps, 'variant'> & {
  gradient?: 'primary' | 'success' | 'warning'
}

const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, gradient = 'primary', ...props }, ref) => {
    const gradientStyles = {
      primary:
        'border-transparent bg-gradient-to-r from-[#5465ff] to-[#7c8cff] text-white hover:opacity-90',
      success:
        'border-transparent bg-gradient-to-r from-emerald-500 to-teal-400 text-white hover:opacity-90',
      warning:
        'border-transparent bg-gradient-to-r from-amber-500 to-orange-400 text-white hover:opacity-90',
    } as const

    return (
      <PremiumButton
        ref={ref}
        className={cn('shadow-md', gradientStyles[gradient], className)}
        {...props}
      />
    )
  },
)
GradientButton.displayName = 'GradientButton'

export { GradientButton }

export type GhostButtonProps = Omit<PremiumButtonProps, 'variant'>

const GhostButton = React.forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ className, ...props }, ref) => (
    <PremiumButton
      ref={ref}
      variant="ghost"
      className={cn('text-muted-foreground hover:text-foreground', className)}
      {...props}
    />
  ),
)
GhostButton.displayName = 'GhostButton'

export { GhostButton }

export type IconButtonProps = Omit<PremiumButtonProps, 'size' | 'children'> & {
  icon: React.ReactNode
  label: string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, label, ...props }, ref) => (
    <PremiumButton
      ref={ref}
      size="icon"
      className={cn('rounded-full', className)}
      aria-label={label}
      {...props}
    >
      {icon}
    </PremiumButton>
  ),
)
IconButton.displayName = 'IconButton'

export { IconButton }
