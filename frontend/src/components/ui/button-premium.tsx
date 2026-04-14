import { Loader2 } from 'lucide-react'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'

import { type ButtonVariantProps, buttonVariants } from '@/components/ui/button-variants'
import { emitUiSound, resolveButtonPointerSound } from '@/lib/ui-sound'
import { cn } from '@/lib/utils'

export type PremiumButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariantProps & {
    asChild?: boolean
    isLoading?: boolean
    loadingText?: string
    showRipple?: boolean
    glowOnHover?: boolean
    'data-ui-sound'?: string
    'data-ui-silent'?: boolean | ''
  }

const PremiumButton = React.forwardRef<HTMLButtonElement, PremiumButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      showRipple = true,
      glowOnHover = false,
      children,
      disabled,
      onClick,
      type = 'button',
      'data-ui-sound': dataUiSound,
      'data-ui-silent': dataUiSilent,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const [ripples, setRipples] = React.useState<
      Array<{ id: number; x: number; y: number }>
    >([])

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isLoading && !disabled) {
        const sk = resolveButtonPointerSound({
          variant,
          type,
          disabled: Boolean(disabled),
          'data-ui-sound': dataUiSound,
          'data-ui-silent': dataUiSilent,
        })
        if (sk) emitUiSound(sk)
      }
      if (showRipple && !isLoading && !disabled) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const id = Date.now()

        setRipples((prev) => [...prev, { id, x, y }])

        // Remove ripple after animation
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id))
        }, 600)
      }

      onClick?.(e)
    }

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          'relative overflow-hidden transition-all duration-200 ease-out',
          'active:scale-[0.96]',
          isLoading && 'cursor-not-allowed opacity-70',
          glowOnHover && 'hover:shadow-[0_0_20px_rgba(84,101,255,0.4)]',
          'disabled:pointer-events-none disabled:opacity-50'
        )}
        ref={ref}
        type={asChild ? undefined : type}
        disabled={disabled || isLoading}
        onClick={handleClick}
        data-ui-sound={dataUiSound}
        data-ui-silent={dataUiSilent}
        {...props}
      >
        {/* Ripple effects */}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="pointer-events-none absolute rounded-full bg-white/30 animate-ripple"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 20,
              height: 20,
              marginLeft: -10,
              marginTop: -10,
            }}
          />
        ))}

        {/* Loading spinner or content */}
        <span
          className={cn(
            'flex items-center justify-center gap-2 transition-opacity duration-200',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
        >
          {children}
        </span>

        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {loadingText && <span className="text-sm">{loadingText}</span>}
          </span>
        )}
      </Comp>
    )
  }
)
PremiumButton.displayName = 'PremiumButton'

export { PremiumButton }

// Enhanced gradient button for primary CTAs
export type GradientButtonProps = Omit<PremiumButtonProps, 'variant'> & {
  gradient?: 'primary' | 'success' | 'warning'
}

const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, gradient = 'primary', children, ...props }, ref) => {
    const gradientStyles = {
      primary: 'from-[#5465ff] to-[#7c8cff]',
      success: 'from-emerald-500 to-teal-400',
      warning: 'from-amber-500 to-orange-400',
    }

    return (
      <PremiumButton
        ref={ref}
        className={cn(
          'relative border-0 bg-gradient-to-r text-white shadow-lg',
          'hover:shadow-xl hover:brightness-110',
          'active:brightness-95 active:scale-[0.96]',
          gradientStyles[gradient],
          className
        )}
        {...props}
      >
        {children}
      </PremiumButton>
    )
  }
)
GradientButton.displayName = 'GradientButton'

export { GradientButton }

// Ghost button with enhanced hover states
export type GhostButtonProps = Omit<PremiumButtonProps, 'variant'>

const GhostButton = React.forwardRef<HTMLButtonElement, GhostButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <PremiumButton
        ref={ref}
        variant="ghost"
        className={cn(
          'text-muted-foreground transition-all duration-200',
          'hover:bg-muted/60 hover:text-foreground',
          'active:scale-[0.96]',
          className
        )}
        {...props}
      >
        {children}
      </PremiumButton>
    )
  }
)
GhostButton.displayName = 'GhostButton'

export { GhostButton }

// Icon button with premium interactions
export type IconButtonProps = Omit<PremiumButtonProps, 'size'> & {
  icon: React.ReactNode
  label: string
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, label, asChild, ...props }, ref) => {
    if (asChild) {
      return (
        <PremiumButton
          ref={ref}
          size="icon"
          asChild
          className={cn(
            'relative size-10 rounded-full',
            'transition-all duration-200',
            'hover:bg-muted hover:scale-105',
            'active:scale-95',
            className
          )}
          aria-label={label}
          {...props}
        >
          <span className="flex items-center justify-center">{icon}</span>
        </PremiumButton>
      )
    }
    
    return (
      <PremiumButton
        ref={ref}
        size="icon"
        className={cn(
          'relative size-10 rounded-full',
          'transition-all duration-200',
          'hover:bg-muted hover:scale-105',
          'active:scale-95',
          className
        )}
        aria-label={label}
        {...props}
      >
        {icon}
      </PremiumButton>
    )
  }
)
IconButton.displayName = 'IconButton'

export { IconButton }
