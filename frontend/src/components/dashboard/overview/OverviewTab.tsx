import type { ReactNode } from 'react'

import { ClosingReadyCard } from '@/components/closing/ClosingReadyCard'
import { ControlRoomCard } from '@/components/control-room/ControlRoomCard'
import { AppSetupCard } from '@/components/dashboard/overview/AppSetupCard'
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting'

type Props = {
  firstName: string
  /** Approvals only the admin can clear — shown only when something is waiting. */
  actionNeeded?: ReactNode
  /** Engagement cards shown right after the team status (jackpot, live feed). */
  highlights?: ReactNode
  /** Tools and audits — useful, but not the first thing to see. */
  tools?: ReactNode
}

/** Admin home, kept to one question: is everyone working today, and do they have leads? */
export function OverviewTab({ firstName, actionNeeded, highlights, tools }: Props) {
  return (
    <div className="space-y-4">
      <DashboardGreeting firstName={firstName} />
      {actionNeeded}
      <ClosingReadyCard />
      <ControlRoomCard groupByLeader />
      {highlights}
      <AppSetupCard />
      {tools}
    </div>
  )
}
