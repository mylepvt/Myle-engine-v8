import * as React from 'react'
import { cn } from '@/lib/utils'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

// Page transition wrapper
interface PageTransitionProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

const PageTransition = ({ children, className, delay = 0 }: PageTransitionProps) => {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn(
        !reduced && 'animate-slide-up opacity-0',
        className
      )}
      style={
        !reduced
          ? {
              animationDelay: `${delay}ms`,
              animationFillMode: 'forwards',
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

// Staggered children animation
interface StaggerContainerProps {
  children: React.ReactNode
  className?: string
  staggerDelay?: number
}

const StaggerContainer = ({
  children,
  className,
  staggerDelay = 50,
}: StaggerContainerProps) => {
  const reduced = useReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <div
          className="animate-slide-up opacity-0"
          style={{
            animationDelay: `${index * staggerDelay}ms`,
            animationFillMode: 'forwards',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

// Fade in wrapper
interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
}

const FadeIn = ({
  children,
  className,
  delay = 0,
  duration = 200,
}: FadeInProps) => {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn(className)}
      style={
        !reduced
          ? {
              animation: `fadeIn ${duration}ms ease-out forwards`,
              animationDelay: `${delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

// Scale in wrapper
interface ScaleInProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

const ScaleIn = ({ children, className, delay = 0 }: ScaleInProps) => {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn(className)}
      style={
        !reduced
          ? {
              animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              animationDelay: `${delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

// Hover lift wrapper
interface HoverLiftProps {
  children: React.ReactNode
  className?: string
}

const HoverLift = ({ children, className }: HoverLiftProps) => {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn(
        !reduced && 'hover:-translate-y-1 hover:shadow-premium-hover',
        'transition-all duration-200 ease-out',
        className
      )}
    >
      {children}
    </div>
  )
}

// Pressable wrapper for tap feedback
interface PressableProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

const Pressable = ({ children, className, onClick }: PressableProps) => {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn(
        !reduced && 'active:scale-[0.97]',
        'transition-transform duration-180 ease-out cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

// Animated number counter
interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}

const AnimatedNumber = ({
  value,
  prefix = '',
  suffix = '',
  duration = 600,
  className,
}: AnimatedNumberProps) => {
  const reduced = useReducedMotion()
  const [displayValue, setDisplayValue] = React.useState(0)
  const elementRef = React.useRef<HTMLSpanElement>(null)
  const hasAnimated = React.useRef(false)

  React.useEffect(() => {
    if (reduced) {
      setDisplayValue(value)
      return
    }
    if (hasAnimated.current) {
      setDisplayValue(value)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true
            const startTime = Date.now()
            const startValue = 0
            const endValue = value

            const animate = () => {
              const elapsed = Date.now() - startTime
              const progress = Math.min(elapsed / duration, 1)

              // Ease out cubic
              const easeOut = 1 - Math.pow(1 - progress, 3)
              const current = Math.floor(startValue + (endValue - startValue) * easeOut)

              setDisplayValue(current)

              if (progress < 1) {
                requestAnimationFrame(animate)
              }
            }

            requestAnimationFrame(animate)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.1 },
    )

    if (elementRef.current) {
      observer.observe(elementRef.current)
    }

    return () => observer.disconnect()
  }, [value, duration, reduced])

  return (
    <span ref={elementRef} className={className}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  )
}

// Animated progress bar
interface AnimatedProgressProps {
  value: number
  max?: number
  className?: string
  barClassName?: string
}

const AnimatedProgress = ({
  value,
  max = 100,
  className,
  barClassName,
}: AnimatedProgressProps) => {
  const reduced = useReducedMotion()
  const percentage = Math.min((value / max) * 100, 100)
  const [width, setWidth] = React.useState(percentage)

  React.useEffect(() => {
    if (reduced) {
      setWidth(percentage)
      return
    }
    const timer = setTimeout(() => setWidth(percentage), 100)
    return () => clearTimeout(timer)
  }, [percentage, reduced])

  return (
    <div className={cn('h-2 w-full rounded-full bg-muted overflow-hidden', className)}>
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-primary to-accent',
          !reduced && 'transition-all duration-700 ease-out',
          barClassName,
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

// Glow effect wrapper
interface GlowProps {
  children: React.ReactNode
  className?: string
  color?: 'primary' | 'success' | 'warning' | 'error'
}

const Glow = ({ children, className, color = 'primary' }: GlowProps) => {
  const reduced = useReducedMotion()
  const colorMap = {
    primary: 'rgba(84, 101, 255, 0.3)',
    success: 'rgba(16, 185, 129, 0.3)',
    warning: 'rgba(245, 158, 11, 0.3)',
    error: 'rgba(239, 68, 68, 0.3)',
  }

  return (
    <div
      className={cn(
        !reduced && 'hover:shadow-[0_0_20px_var(--glow-color)]',
        'transition-shadow duration-200',
        className,
      )}
      style={{ '--glow-color': colorMap[color] } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

// Pulse animation for attention
interface PulseProps {
  children: React.ReactNode
  className?: string
}

const Pulse = ({ children, className }: PulseProps) => {
  return (
    <div className={cn('animate-pulse', className)}>
      {children}
    </div>
  )
}

// Spotlight effect (for cards)
interface SpotlightProps {
  children: React.ReactNode
  className?: string
}

const Spotlight = ({ children, className }: SpotlightProps) => {
  return (
    <div className={cn('relative overflow-hidden group', className)}>
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none">
        <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-300 ease-out group-hover:translate-x-[100%]" />
      </div>
      {children}
    </div>
  )
}

export {
  PageTransition,
  StaggerContainer,
  FadeIn,
  ScaleIn,
  HoverLift,
  Pressable,
  AnimatedNumber,
  AnimatedProgress,
  Glow,
  Pulse,
  Spotlight,
}
