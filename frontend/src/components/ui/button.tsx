import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'

import { type ButtonVariantProps, buttonVariants } from '@/components/ui/button-variants'
import { emitUiSound, resolveButtonPointerSound } from '@/lib/ui-sound'
import { cn } from '@/lib/utils'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariantProps & {
    asChild?: boolean
    /** Set to `silent` or use `data-ui-silent` to skip pointer sounds. Any other value = explicit snd-lib mapping. */
    'data-ui-sound'?: string
    'data-ui-silent'?: boolean | ''
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      onPointerDown,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const soundKind = resolveButtonPointerSound({
      variant,
      type,
      disabled,
      'data-ui-sound': rest['data-ui-sound'],
      'data-ui-silent': rest['data-ui-silent'],
    })
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type}
        disabled={disabled}
        onPointerDown={(e) => {
          if (soundKind) emitUiSound(soundKind)
          onPointerDown?.(e)
        }}
        {...rest}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button }
