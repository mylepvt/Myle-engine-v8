import * as React from 'react'
import { m } from 'motion/react'

import { SPRING } from '@/lib/springs'
import { cn } from '@/lib/utils'

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

// Track 44×24 with a 2px border → 40px inner run; knob 20px rests at x 0 / 20.
const KNOB = 20
const KNOB_PRESSED = 25
const RUN = 20

/**
 * Toggle (Radix-free) — API matches `@radix-ui/react-switch`: `checked` + `onCheckedChange`.
 * The knob stretches toward its travel the moment it's pressed and springs across on release.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, onPointerDown, ...props }, ref) => {
    const [pressed, setPressed] = React.useState(false)
    const release = () => setPressed(false)
    const width = pressed ? KNOB_PRESSED : KNOB
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked ? 'true' : 'false'}
        data-state={checked ? 'checked' : 'unchecked'}
        disabled={disabled}
        ref={ref}
        onPointerDown={(e) => {
          if (!disabled) setPressed(true)
          onPointerDown?.(e)
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onClick={() => {
          if (!disabled) onCheckedChange?.(!checked)
        }}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'bg-primary' : 'bg-input',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...props}
      >
        <m.span
          aria-hidden
          initial={false}
          animate={{ x: checked ? RUN + KNOB - width : 0, width }}
          transition={SPRING.snappy}
          className="pointer-events-none absolute left-0 top-0 block h-5 rounded-full bg-background shadow-md ring-0"
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'

export { Switch }
