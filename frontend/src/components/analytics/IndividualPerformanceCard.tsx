import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity } from 'lucide-react'

import type { IndividualPerformanceResponse } from '@/hooks/use-analytics-query'

interface IndividualPerformanceCardProps {
  performance?: IndividualPerformanceResponse
  isLoading: boolean
}

export default function IndividualPerformanceCard({
  performance,
  isLoading,
}: IndividualPerformanceCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    )
  }

  if (!performance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Your performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Points</span>
          <span className="font-semibold">{performance.scores.total_points}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Reports</span>
          <span className="font-semibold">{performance.reports.total_reports}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Calls</span>
          <span className="font-semibold">{performance.reports.total_calls}</span>
        </div>
      </CardContent>
    </Card>
  )
}
