import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, Calendar, Download } from 'lucide-react'
import { 
  useTeamPerformanceQuery,
  useIndividualPerformanceQuery,
  useLeaderboardQuery,
  useSystemOverviewQuery,
  useDailyTrendsQuery
} from '@/hooks/use-analytics-query'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import TeamPerformanceCard from '@/components/analytics/TeamPerformanceCard'
import IndividualPerformanceCard from '@/components/analytics/IndividualPerformanceCard'
import LeaderboardTable from '@/components/analytics/LeaderboardTable'
import SystemOverviewCard from '@/components/analytics/SystemOverviewCard'
import DailyTrendsChart from '@/components/analytics/DailyTrendsChart'

export default function AnalyticsPage() {
  const [selectedDays, setSelectedDays] = useState(30)
  const [activeTab, setActiveTab] = useState('overview')
  const { data: authData } = useAuthMeQuery()
  const isAdmin = authData?.role === 'admin'
  const isLeader = authData?.role === 'leader'
  const canViewTeam = isAdmin || isLeader
  
  const teamPerformance = useTeamPerformanceQuery(selectedDays, canViewTeam)
  const individualPerformance = useIndividualPerformanceQuery(undefined, selectedDays)
  const leaderboard = useLeaderboardQuery(selectedDays)
  const systemOverview = useSystemOverviewQuery(selectedDays, isAdmin)
  const dailyTrends = useDailyTrendsQuery(undefined, selectedDays)

  return (
    <div className="min-w-0 overflow-x-hidden p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Analytics & Reports</h1>
            <p className="text-sm text-muted-foreground">
              Performance metrics and insights for your team
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0" />
              <select
                value={selectedDays}
                onChange={(e) => setSelectedDays(Number(e.target.value))}
                className="px-2 py-1.5 border rounded-md text-xs sm:text-sm"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <Badge variant="outline" className="text-xs sm:text-sm">
              {authData?.role?.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className={`inline-flex w-auto ${isAdmin ? 'grid-cols-4' : canViewTeam ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canViewTeam && <TabsTrigger value="team">Team</TabsTrigger>}
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            {isAdmin && <TabsTrigger value="system">System</TabsTrigger>}
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Individual Performance */}
            <IndividualPerformanceCard 
              performance={individualPerformance.data}
              isLoading={individualPerformance.isLoading}
            />

            {/* Daily Trends */}
            <DailyTrendsChart 
              trends={dailyTrends.data?.trends}
              isLoading={dailyTrends.isLoading}
            />

            {/* Quick Stats */}
            <Card>
              <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                <CardTitle className="text-base sm:text-lg flex items-center">
                  <Activity className="w-4 h-4 mr-1.5 shrink-0" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Reports Submitted</span>
                    <span className="font-semibold text-sm">
                      {individualPerformance.data?.reports.total_reports || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Total Calls</span>
                    <span className="font-semibold text-sm">
                      {individualPerformance.data?.reports.total_calls || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Enrollments</span>
                    <span className="font-semibold text-sm">
                      {individualPerformance.data?.reports.total_flp_min_billings || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Points Earned</span>
                    <span className="font-semibold text-sm">
                      {individualPerformance.data?.scores.total_points || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Team Performance Tab */}
        {canViewTeam && (
          <TabsContent value="team" className="space-y-4 sm:space-y-6">
            <TeamPerformanceCard 
              performance={teamPerformance.data}
              isLoading={teamPerformance.isLoading}
            />
          </TabsContent>
        )}

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4 sm:space-y-6">
          <LeaderboardTable 
              leaderboard={leaderboard.data}
              isLoading={leaderboard.isLoading}
            />
        </TabsContent>

        {/* System Overview Tab */}
        {isAdmin && (
          <TabsContent value="system" className="space-y-4 sm:space-y-6">
            <SystemOverviewCard 
              overview={systemOverview.data}
              isLoading={systemOverview.isLoading}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Export Options */}
      <div className="mt-6 sm:mt-8 rounded-lg bg-muted/30 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-medium">Export Data</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Download analytics data for offline analysis</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const trends = dailyTrends.data?.trends ?? []
                if (!trends.length) return
                const header = Object.keys(trends[0]).join(',')
                const rows = trends.map((r) => Object.values(r).join(','))
                const csv = [header, ...rows].join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `analytics-${selectedDays}d.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
              disabled={!dailyTrends.data?.trends?.length}
              className="text-xs sm:text-sm"
            >
              <Download className="mr-1.5 w-3.5 h-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const trends = dailyTrends.data?.trends ?? []
                if (!trends.length) return
                const header = Object.keys(trends[0]).join('\t')
                const rows = trends.map((r) => Object.values(r).join('\t'))
                const tsv = [header, ...rows].join('\n')
                const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `analytics-${selectedDays}d.xls`
                a.click()
                URL.revokeObjectURL(url)
              }}
              disabled={!dailyTrends.data?.trends?.length}
              className="text-xs sm:text-sm"
            >
              <Download className="mr-1.5 w-3.5 h-3.5" />
              Excel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
