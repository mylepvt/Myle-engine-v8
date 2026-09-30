import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import { selectedOptionLabel } from '@/lib/select-options'
import { cn } from '@/lib/utils'

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Classes for the visible box (border, padding, width, height, text size). */
  className?: string
  /** Optional element before the label (status dot, icon). */
  leading?: React.ReactNode
  /** Shown when no option matches the current value (else the first option, like a native select). */
  placeholder?: string
  /** Hide the chevron (e.g. when the caller draws its own). */
  hideChevron?: boolean
}

/**
 * Drop-in replacement for `<select>`: the visible text is a truncating label
 * ("Enrollment V…") with a chevron, and the real `<select>` sits invisibly over
 * the whole box — taps still open the native picker (best on phones), while the
 * global dashboard `select` styles (grey fill, 16px font) never show. Looks the
 * same on Android, iOS and desktop.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { className, leading, placeholder, hideChevron = false, children, value, defaultValue, onChange, disabled, ...rest },
  ref,
) {
  const controlled = value !== undefined
  const [innerValue, setInnerValue] = React.useState(defaultValue)
  const current = controlled ? value : innerValue
  const { found, first } = selectedOptionLabel(children, current)
  const label = found ?? placeholder ?? first ?? ''

  return (
    <div
      className={cn(
        'relative inline-flex min-w-0 items-center gap-1.5 focus-within:ring-2 focus-within:ring-primary/40',
        disabled && 'opacity-50',
        className,
      )}
    >
      {leading}
      {/* Chevron space lives on the label so caller padding (px-3 …) can't remove it. */}
      <span className={cn('min-w-0 flex-1 truncate text-left', !hideChevron && 'mr-7')}>{label}</span>
      {hideChevron ? null : (
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      )}
      <select
        ref={ref}
        {...rest}
        value={controlled ? value : undefined}
        defaultValue={controlled ? undefined : defaultValue}
        disabled={disabled}
        onChange={(e) => {
          if (!controlled) setInnerValue(e.target.value)
          onChange?.(e)
        }}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {children}
      </select>
    </div>
  )
})
