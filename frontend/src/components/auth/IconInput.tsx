import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type IconInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'className'
> & {
  icon: LucideIcon
  id: string
  inputClassName?: string
  /** Renders after the input (e.g. password visibility toggle). */
  endAdornment?: React.ReactNode
  wrapperClassName?: string
}

export const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  function IconInput(
    { icon: Icon, id, endAdornment, wrapperClassName, inputClassName, ...rest },
    ref,
  ) {
    return (
      <div
        className={cn(
          'flex min-h-[44px] w-full overflow-hidden rounded-xl border border-white/[0.1] bg-muted/35 transition-[border-color,box-shadow] duration-200 ease-out',
          'focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent),0_0_20px_-4px_color-mix(in_srgb,var(--primary)_35%,transparent)]',
          wrapperClassName,
        )}
      >
        <span
          className="flex shrink-0 items-center border-r border-white/[0.08] px-3.5 text-muted-foreground"
          aria-hidden
        >
          <Icon className="size-[1.15rem]" />
        </span>
        <input
          ref={ref}
          id={id}
          className={cn(
            'min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none',
            'placeholder:text-muted-foreground',
            inputClassName,
          )}
          {...rest}
        />
        {endAdornment ? (
          <div className="flex shrink-0 items-center pr-1">{endAdornment}</div>
        ) : null}
      </div>
    )
  },
)
