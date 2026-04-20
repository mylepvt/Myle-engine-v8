import { Search, X } from 'lucide-react'

import { Input, type InputProps } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ListSearchInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  wrapperClassName?: string
}

export function ListSearchInput({
  value,
  onValueChange,
  wrapperClassName,
  className,
  ...props
}: ListSearchInputProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60"
        aria-hidden
      />
      <Input
        {...props}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete="off"
        className={cn('pl-9', value ? 'pr-10' : 'pr-3', className)}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange('')}
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
