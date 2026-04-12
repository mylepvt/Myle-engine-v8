import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'

import type { DailyTrendsResponse } from '@/hooks/use-analytics-query'

interface DailyTrendsChartProps {
  trends?: DailyTrendsResponse['trends']
  isLoading: boolean
}

export default function DailyTrendsChart({ trends, isLoading }: DailyTrendsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    )
  }

  const rows = trends ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Daily trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trend data for this period.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-auto text-xs">
            {rows.slice(-10).map((t) => (
              <li key={t.date} className="flex justify-between gap-2 border-b border-border/60 py-1">
                <span className="text-muted-foreground">{t.date}</span>
                <span>
                  calls {t.total_calls} · enroll {t.total_enrollments}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
