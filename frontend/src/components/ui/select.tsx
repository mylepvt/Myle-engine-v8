import * as React from "react"
import { cn } from "@/lib/utils"

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

const Select: React.FC<SelectProps> = ({ value, onValueChange, children }) => {
  return (
    <div className="relative">
      {React.Children.map(children, (child) =>
        React.isValidElement<{ value?: string; onValueChange?: (v: string) => void }>(child)
          ? React.cloneElement(child, { value, onValueChange })
          : child,
      )}
    </div>
  )
}

interface SelectTriggerProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  value?: string
  onValueChange?: (value: string) => void
}

const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectTriggerProps>(
  ({ className, children, value, onValueChange, ...props }, ref) => (
    <select
      ref={ref}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
SelectTrigger.displayName = "SelectTrigger"

interface SelectValueProps {
  placeholder?: string
  value?: string
}

const SelectValue: React.FC<SelectValueProps> = ({ placeholder, value }) => {
  return <>{value || placeholder}</>
}

interface SelectContentProps {
  children: React.ReactNode
}

const SelectContent: React.FC<SelectContentProps> = ({ children }) => {
  return <>{children}</>
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
}

const SelectItem: React.FC<SelectItemProps> = ({ value, children }) => {
  return <option value={value}>{children}</option>
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
}
