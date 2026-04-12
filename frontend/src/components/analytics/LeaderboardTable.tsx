import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import type { LeaderboardResponse } from '@/hooks/use-analytics-query'

interface LeaderboardTableProps {
  leaderboard?: LeaderboardResponse
  isLoading: boolean
}

export default function LeaderboardTable({ leaderboard, isLoading }: LeaderboardTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    )
  }

  const rows = leaderboard?.leaderboard ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Leaderboard</CardTitle>
        {leaderboard?.period ? (
          <p className="text-xs text-muted-foreground">Period: {leaderboard.period}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leaderboard entries.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 pr-2">Points</th>
                  <th className="py-2">Avg / day</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-border/50">
                    <td className="py-2 pr-2">
                      <Badge variant="outline">{r.rank}</Badge>
                    </td>
                    <td className="py-2 pr-2">{r.username}</td>
                    <td className="py-2 pr-2">{r.total_points}</td>
                    <td className="py-2">{r.avg_daily_points.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
