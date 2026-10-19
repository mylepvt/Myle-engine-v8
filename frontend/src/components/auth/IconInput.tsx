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
          'input-base flex h-11 w-full items-center overflow-hidden',
          wrapperClassName,
        )}
      >
        <span
          className="flex shrink-0 items-center pl-3.5 text-muted-foreground"
          aria-hidden
        >
          <Icon className="size-[18px]" />
        </span>
        <input
          ref={ref}
          id={id}
          className={cn(
            'h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-ds-body text-foreground outline-none focus-visible:shadow-none',
            'placeholder:text-subtle',
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
