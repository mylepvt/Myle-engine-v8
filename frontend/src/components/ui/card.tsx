import * as React from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import { cn } from '@/lib/utils'

/** Myle card: solid gloss, 22px, soft shadow, specular edge, no border (see `.card` in index.css). */
const cardBase = 'card text-card-foreground'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(cardBase, className)}
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
    className={cn(cardBase, 'card-interactive press block no-underline', className)}
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
    className={cn('flex flex-col gap-1 p-4 sm:p-5', className)}
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
    className={cn('font-heading text-base font-semibold leading-tight tracking-tight text-foreground', className)}
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
    className={cn('text-sm leading-normal text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 sm:p-5', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-3 p-4 sm:p-5', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardLink, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
