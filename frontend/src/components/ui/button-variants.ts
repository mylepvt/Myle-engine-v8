import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Myle pill buttons. Fills come from `.btn-primary` / `.btn-secondary` /
 * `.btn-destructive` in index.css; `.press` shrinks to 0.97 on touch-down
 * (100ms) and springs back on release.
 */
export const buttonVariants = cva(
  'press inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'btn-primary',
        secondary: 'btn-secondary',
        outline: 'btn-secondary',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive: 'btn-destructive',
      },
      size: {
        // Touch screens keep the 44px minimum tap target (Apple HIG); sm stays dense.
        default: 'h-10 px-4 text-sm [@media(pointer:coarse)]:min-h-11',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'size-10 [@media(pointer:coarse)]:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
