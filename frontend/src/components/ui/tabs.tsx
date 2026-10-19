import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { m } from "motion/react"

import { SPRING } from "@/lib/springs"
import { cn } from "@/lib/utils"

/** Active value + a per-Tabs id, so each trigger list gets its own sliding indicator. */
const TabsContext = React.createContext<{ value: string | undefined; group: string } | null>(null)

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const current = value !== undefined ? value : uncontrolled
  const group = React.useId()
  const ctx = React.useMemo(() => ({ value: current, group }), [current, group])
  return (
    <TabsContext.Provider value={ctx}>
      <TabsPrimitive.Root
        ref={ref}
        value={current}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolled(next)
          onValueChange?.(next)
        }}
        {...props}
      />
    </TabsContext.Provider>
  )
})
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // iOS segmented control: a muted pill track; the active item is a raised pill.
      "inline-flex max-w-full items-center gap-0.5 rounded-full bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "text-muted-foreground hover:text-foreground",
        "data-[state=active]:text-foreground",
        className
      )}
      {...props}
    >
      {active && ctx ? (
        // One indicator per Tabs, handed between triggers: it slides to the new tab.
        <m.span
          aria-hidden
          layoutId={`tabs-indicator-${ctx.group}`}
          transition={SPRING.snappy}
          className="control-pill absolute inset-0 -z-10 rounded-full"
        />
      ) : null}
      {children}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
