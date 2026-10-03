import type { ReactNode } from 'react'

import { ControlRoomCard } from '@/components/control-room/ControlRoomCard'
import { AppSetupCard } from '@/components/dashboard/overview/AppSetupCard'

type Props = {
  firstName: string
  /** Approvals only the admin can clear — shown only when something is waiting. */
  actionNeeded?: ReactNode
}

/** Admin home, kept to one question: is everyone working today, and do they have leads? */
export function OverviewTab({ firstName, actionNeeded }: Props) {
  return (
    <div className="space-y-5">
      <h1 className="px-0.5 text-ds-h2 font-semibold capitalize tracking-tight text-foreground">Welcome back, {firstName}</h1>
      <ControlRoomCard groupByLeader />
      <AppSetupCard />
      {actionNeeded}
    </div>
  )
}
