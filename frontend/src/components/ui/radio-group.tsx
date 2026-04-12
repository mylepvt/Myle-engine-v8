import * as React from 'react'

import { cn } from '@/lib/utils'

type RadioGroupCtx = {
  value: string
  onValueChange: (value: string) => void
  name: string
}

const RadioGroupContext = React.createContext<RadioGroupCtx | null>(null)

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (value: string) => void
}

function RadioGroup({
  className,
  value = '',
  onValueChange,
  children,
  ...props
}: RadioGroupProps) {
  const name = React.useId()
  const ctx = React.useMemo<RadioGroupCtx>(
    () => ({
      value,
      onValueChange: onValueChange ?? (() => {}),
      name,
    }),
    [value, onValueChange, name],
  )

  return (
    <RadioGroupContext.Provider value={ctx}>
      <div role="radiogroup" className={cn('grid gap-2', className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value: itemValue, id, disabled, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext)
    if (!ctx) {
      throw new Error('RadioGroupItem must be used within RadioGroup')
    }
    const checked = ctx.value === itemValue

    return (
      <input
        ref={ref}
        type="radio"
        id={id}
        name={ctx.name}
        value={itemValue}
        checked={checked}
        disabled={disabled}
        className={cn(
          'aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onChange={() => {
          if (!disabled) ctx.onValueChange(itemValue)
        }}
        {...props}
      />
    )
  },
)
RadioGroupItem.displayName = 'RadioGroupItem'

export { RadioGroup, RadioGroupItem }
