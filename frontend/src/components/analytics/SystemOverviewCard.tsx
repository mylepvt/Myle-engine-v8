import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { SystemOverviewResponse } from '@/hooks/use-analytics-query'

interface SystemOverviewCardProps {
  overview?: SystemOverviewResponse
  isLoading: boolean
}

export default function SystemOverviewCard({ overview, isLoading }: SystemOverviewCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    )
  }

  if (!overview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No system metrics for this period.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users & reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active users</span>
            <span className="font-medium">{overview.users.active_users}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total reports</span>
            <span className="font-medium">{overview.reports.total_reports}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total calls</span>
            <span className="font-medium">{overview.reports.total_calls}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wallet volume</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active wallets</span>
            <span className="font-medium">{overview.wallet.active_wallets}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net volume</span>
            <span className="font-medium">{overview.wallet.net_volume}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
