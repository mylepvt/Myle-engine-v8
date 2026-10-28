import type { ReactNode } from 'react'

type Props = {
  firstName: string
  /** Pills on the right (quick actions); wraps under the title on phones. */
  actions?: ReactNode
}

/** Myle home header: the greeting, actions to the right. Today's date lives in the daily card above. */
export function DashboardGreeting({ firstName, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h1 className="text-ds-h1 text-foreground">Welcome back, {firstName}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
