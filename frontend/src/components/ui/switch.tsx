import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Toggle (Radix-free) — API matches `@radix-ui/react-switch`: `checked` + `onCheckedChange`.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      ref={ref}
      onClick={() => {
        if (!disabled) onCheckedChange?.(!checked)
      }}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md ring-0 transition-transform',
          'absolute left-0.5 top-0.5',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  ),
)
Switch.displayName = 'Switch'

export { Switch }
