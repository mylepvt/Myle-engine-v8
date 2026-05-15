import * as React from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import { cn } from '@/lib/utils'

const cardBase =
  'rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-200'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      cardBase,
      'hover:shadow-[var(--shadow-card-hover)]',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<LinkProps, 'className'> & { className?: string }
>(({ className, ...props }, ref) => (
  <Link
    ref={ref}
    className={cn(
      cardBase,
      'block cursor-pointer no-underline',
      'hover:shadow-[var(--shadow-card-hover)]',
      'active:shadow-[var(--shadow-card)]',
      className,
    )}
    {...props}
  />
))
CardLink.displayName = 'CardLink'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-4 py-3 md:px-5 md:py-4 flex flex-col gap-1', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-heading text-ds-h3 text-foreground leading-tight', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-ds-caption text-muted-foreground leading-normal pt-1', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-4 py-3 md:px-5 md:py-4', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-4 py-3 md:px-5 md:py-4 flex items-center gap-3', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardLink, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
