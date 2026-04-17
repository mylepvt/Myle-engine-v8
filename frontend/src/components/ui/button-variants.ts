import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.625rem] text-sm font-semibold transition-[color,background,opacity,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:opacity-92 active:opacity-88',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-muted active:opacity-90',
        ghost:
          'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        outline:
          'border border-border bg-transparent hover:bg-muted/50 active:opacity-90',
      },
      size: {
        default: 'h-11 min-h-[44px] px-4 py-2',
        sm: 'h-10 min-h-[40px] rounded-md px-3 text-xs',
        lg: 'h-12 min-h-[48px] rounded-xl px-8 text-base',
        icon: 'h-11 min-h-[44px] w-11 min-w-[44px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
