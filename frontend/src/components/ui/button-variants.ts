import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-ds-body font-semibold transition-[background-color,color,border-color,transform] duration-100 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary),black_20%)] active:bg-[color-mix(in_srgb,var(--primary),black_30%)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),black_15%)] active:bg-[color-mix(in_srgb,var(--secondary),black_25%)]',
        ghost:
          'text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] active:bg-[color-mix(in_srgb,var(--foreground)_13%,transparent)]',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--destructive),black_20%)] active:bg-[color-mix(in_srgb,var(--destructive),black_30%)]',
      },
      size: {
        default: 'h-9 min-h-[36px] px-4 py-2',
        sm: 'h-8 min-h-[32px] px-3 text-ds-caption',
        lg: 'h-10 min-h-[40px] px-6 text-ds-h3',
        icon: 'h-9 min-h-[36px] w-9 min-w-[36px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
