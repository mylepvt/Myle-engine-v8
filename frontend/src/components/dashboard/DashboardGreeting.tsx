import type { ReactNode } from 'react'

type Props = {
  firstName: string
  /** Pills on the right (quick actions); wraps under the title on phones. */
  actions?: ReactNode
}

/** Myle home header: today's date over the greeting, actions to the right. */
export function DashboardGreeting({ firstName, actions }: Props) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="mt-0.5 text-ds-h1 text-foreground">Welcome back, {firstName}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
