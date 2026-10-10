import { Trophy } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useJackpotWheelQuery } from '@/hooks/use-rewards-query'
import { rupees } from '@/lib/rewards'

import { JackpotWheel } from './JackpotWheel'

/** Admin home: tonight's jackpot wheel on its own card (who is in, and the 9 PM spin). */
export function JackpotCard() {
  const { data } = useJackpotWheelQuery()
  if (!data || !data.entries.length) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Trophy className="size-4 text-warning-ink" aria-hidden />
          Daily Jackpot
          <span className="ml-auto text-ds-caption font-medium tabular-nums text-muted-foreground">
            {rupees(data.pot_rupees)} · 9 PM
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <JackpotWheel myTickets={0} bare />
      </CardContent>
    </Card>
  )
}
