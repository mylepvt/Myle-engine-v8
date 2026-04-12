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
  useDailyTrendsQuery,
  type IndividualPerformanceResponse,
  type LeaderboardResponse,
  type TeamPerformanceResponse,
  type SystemOverviewResponse,
} from '@/hooks/use-analytics-query'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { cn } from '@/lib/utils'
import TeamPerformanceCard from '@/components/analytics/TeamPerformanceCard'
import IndividualPerformanceCard from '@/components/analytics/IndividualPerformanceCard'
import LeaderboardTable from '@/components/analytics/LeaderboardTable'
import SystemOverviewCard from '@/components/analytics/SystemOverviewCard'
import DailyTrendsChart from '@/components/analytics/DailyTrendsChart'

function escapeCsvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function buildAnalyticsRows(
  days: number,
  individual: IndividualPerformanceResponse | undefined,
  leaderboard: LeaderboardResponse | undefined,
  team: TeamPerformanceResponse | undefined,
  system: SystemOverviewResponse | undefined,
  includeTeam: boolean,
  includeSystem: boolean,
): string[][] {
  const rows: string[][] = []
  rows.push(['section', 'field', 'value'])
  rows.push(['meta', 'generated_at', new Date().toISOString()])
  rows.push(['meta', 'window_days', String(days)])

  if (individual) {
    rows.push(['individual', 'period', individual.period])
    rows.push(['individual', 'total_reports', String(individual.reports.total_reports)])
    rows.push(['individual', 'total_calls', String(individual.reports.total_calls)])
    rows.push(['individual', 'total_enrollments', String(individual.reports.total_enrollments)])
    rows.push(['individual', 'total_payments', String(individual.reports.total_payments)])
    rows.push(['individual', 'total_points', String(individual.scores.total_points)])
    rows.push(['individual', 'total_leads', String(individual.leads.total_leads)])
    rows.push(['individual', 'converted_leads', String(individual.leads.converted_leads)])
    for (const d of individual.daily_trends.slice(0, 60)) {
      rows.push(['individual_daily', d.date, `${d.calls} calls, ${d.enrollments} enroll, ${d.points} pts`])
    }
  }

  if (includeTeam && team) {
    rows.push(['team', 'period', team.period])
    rows.push(['team', 'team_size', String(team.team_size)])
    rows.push(['team', 'reports_total', String(team.reports.total_reports)])
    rows.push(['team', 'calls_total', String(team.reports.total_calls)])
    rows.push(['team', 'enrollments', String(team.reports.enrollments)])
    rows.push(['team', 'leads_total', String(team.leads.total_leads)])
    rows.push(['team', 'points_total', String(team.scores.total_points)])
  }

  if (leaderboard?.leaderboard?.length) {
    rows.push(['leaderboard', 'period', leaderboard.period])
    rows.push([
      'leaderboard_header',
      'rank',
      'user_id',
      'username',
      'total_points',
      'days_with_reports',
      'avg_daily_points',
      'total_leads',
      'converted_leads',
    ])
    for (const L of leaderboard.leaderboard) {
      rows.push([
        'leaderboard_row',
        String(L.rank),
        String(L.user_id),
        L.username,
        String(L.total_points),
        String(L.days_with_reports),
        String(L.avg_daily_points),
        String(L.total_leads),
        String(L.converted_leads),
      ])
    }
  }

  if (includeSystem && system) {
    rows.push(['system', 'period', system.period])
    rows.push(['system', 'active_users', String(system.users.active_users)])
    rows.push(['system', 'reports_total', String(system.reports.total_reports)])
    rows.push(['system', 'total_leads', String(system.leads.total_leads)])
    rows.push(['system', 'conversion_rate', String(system.leads.conversion_rate)])
    rows.push(['system', 'wallet_net_volume', String(system.wallet.net_volume)])
  }

  return rows
}

export default function AnalyticsPage() {
  const [selectedDays, setSelectedDays] = useState(30)
  const [activeTab, setActiveTab] = useState('overview')
  const { data: authData } = useAuthMeQuery()
  
  const teamPerformance = useTeamPerformanceQuery(selectedDays)
  const individualPerformance = useIndividualPerformanceQuery(undefined, selectedDays)
  const leaderboard = useLeaderboardQuery(selectedDays)
  const systemOverview = useSystemOverviewQuery(selectedDays)
  const dailyTrends = useDailyTrendsQuery(undefined, selectedDays)

  const isAdmin = authData?.role === 'admin'
  const isLeader = authData?.role === 'leader'
  const canViewTeam = isAdmin || isLeader

  const tabCount = 2 + (canViewTeam ? 1 : 0) + (isAdmin ? 1 : 0)
  const tabListClass = cn(
    'grid w-full gap-1',
    tabCount === 2 && 'grid-cols-2',
    tabCount === 3 && 'grid-cols-3',
    tabCount === 4 && 'grid-cols-4',
  )

  function runExport(kind: 'csv' | 'excel') {
    const rows = buildAnalyticsRows(
      selectedDays,
      individualPerformance.data,
      leaderboard.data,
      teamPerformance.data,
      systemOverview.data,
      canViewTeam,
      isAdmin,
    )
    const sep = kind === 'csv' ? ',' : '\t'
    const lineJoin = '\r\n'
    const body = rows.map((r) => r.map((c) => (kind === 'csv' ? escapeCsvCell(c) : String(c))).join(sep)).join(lineJoin)
    const payload = kind === 'csv' ? '\uFEFF' + body : body
    const ext = kind === 'csv' ? 'csv' : 'tsv'
    const mime = kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8'
    downloadTextFile(`myle-analytics-${selectedDays}d.${ext}`, payload, mime)
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Analytics & Reports</h1>
            <p className="text-gray-600">
              Performance metrics and insights for your team
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <select
                value={selectedDays}
                onChange={(e) => setSelectedDays(Number(e.target.value))}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <Badge variant="outline" className="text-sm">
              {authData?.role?.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={tabListClass}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canViewTeam && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          {isAdmin && <TabsTrigger value="system">System</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Reports Submitted</span>
                    <span className="font-semibold">
                      {individualPerformance.data?.reports.total_reports || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Calls</span>
                    <span className="font-semibold">
                      {individualPerformance.data?.reports.total_calls || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Enrollments</span>
                    <span className="font-semibold">
                      {individualPerformance.data?.reports.total_enrollments || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Points Earned</span>
                    <span className="font-semibold">
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
          <TabsContent value="team" className="space-y-6">
            <TeamPerformanceCard 
              performance={teamPerformance.data}
              isLoading={teamPerformance.isLoading}
            />
          </TabsContent>
        )}

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-6">
          <LeaderboardTable 
              leaderboard={leaderboard.data}
              isLoading={leaderboard.isLoading}
            />
        </TabsContent>

        {/* System Overview Tab */}
        {isAdmin && (
          <TabsContent value="system" className="space-y-6">
            <SystemOverviewCard 
              overview={systemOverview.data}
              isLoading={systemOverview.isLoading}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Export Options */}
      <div className="mt-8 rounded-lg bg-gray-50 p-4 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Export Data</h3>
            <p className="text-sm text-gray-600">Download analytics data for offline analysis</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" type="button" onClick={() => runExport('csv')}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => runExport('excel')}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
