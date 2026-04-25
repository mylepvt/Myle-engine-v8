import { Navigate, useParams } from 'react-router-dom'

import {
  dashboardChildPathSet,
  getDashboardChildRoute,
  resolveTitleForPath,
  routeDefAccessible,
  type FullUiSurface,
} from '@/config/dashboard-registry'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardPlaceholderPage } from '@/pages/DashboardPlaceholderPage'
import { LeadsWorkPage } from '@/pages/LeadsWorkPage'
import { FollowUpsWorkPage } from '@/pages/FollowUpsWorkPage'
import { LeadFlowPage } from '@/pages/LeadFlowPage'
import { LeadPoolWorkPage } from '@/pages/LeadPoolWorkPage'
import { RecycleBinWorkPage } from '@/pages/RecycleBinWorkPage'
import { TeamApprovalsPage } from '@/pages/TeamApprovalsPage'
import { TeamMembersPage } from '@/pages/TeamMembersPage'
import { TeamTrackingDetailPage } from '@/pages/TeamTrackingDetailPage'
import { TeamTrackingPage } from '@/pages/TeamTrackingPage'
import { MyTeamPage } from '@/pages/MyTeamPage'
import { EnrollmentApprovalsPage } from '@/pages/EnrollmentApprovalsPage'
import { AnalyticsSurfacePage } from '@/pages/AnalyticsSurfacePage'
import { SystemSurfacePage } from '@/pages/SystemSurfacePage'
import { RetargetWorkPage } from '@/pages/RetargetWorkPage'
import { WorkboardPage } from '@/pages/WorkboardPage'
import { ShellStubPage } from '@/pages/ShellStubPage'
import { WalletPage } from '@/pages/WalletPage'
import { FinanceRechargesPage } from '@/pages/FinanceRechargesPage'
import { LeadDetailPage } from '@/pages/LeadDetailPage'
import { WalletRechargePage } from '@/pages/WalletRechargePage'
import { WalletRechargeAdminPage } from '@/pages/WalletRechargeAdminPage'
import { NoticeBoardPage } from '@/pages/NoticeBoardPage'
import { TeamReportsPage } from '@/pages/TeamReportsPage'
import { DailyReportFormPage } from '@/pages/DailyReportFormPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { LiveSessionPage } from '@/pages/LiveSessionPage'
import { CommunityTrainingPage } from '@/pages/CommunityTrainingPage'
import { BudgetExportPage } from '@/pages/BudgetExportPage'
import { LeadControlPage } from '@/pages/LeadControlPage'
import { SettingsAppPage } from '@/pages/SettingsAppPage'
import { SettingsHelpPage } from '@/pages/SettingsHelpPage'
import { SettingsOrgTreePage } from '@/pages/SettingsOrgTreePage'
import { AllMembersPage } from '@/pages/AllMembersPage'
import { AdminInvoicesPage } from '@/pages/AdminInvoicesPage'

function renderFullUi(ui: FullUiSurface, title: string) {
  switch (ui.kind) {
    case 'leads':
      return <LeadsWorkPage title={title} listMode={ui.listMode} />
    case 'workboard':
      return <WorkboardPage title={title} />
    case 'follow-ups':
      return <FollowUpsWorkPage title={title} />
    case 'retarget':
      return <RetargetWorkPage title={title} />
    case 'lead-flow':
      return <LeadFlowPage title={title} />
    case 'lead-pool':
      return <LeadPoolWorkPage title={title} />
    case 'recycle-bin':
      return <RecycleBinWorkPage title={title} />
    case 'team-members':
      return <TeamMembersPage title={title} />
    case 'team-tracking':
      return <TeamTrackingPage title={title} />
    case 'team-approvals':
      return <TeamApprovalsPage title={title} />
    case 'my-team':
      return <MyTeamPage title={title} />
    case 'enrollment-approvals':
      return <EnrollmentApprovalsPage title={title} />
    case 'system':
      return <SystemSurfacePage title={title} surface={ui.surface} />
    case 'lead-control':
      return <LeadControlPage title={title} />
    case 'analytics':
      return 'surface' in ui ? (
        <AnalyticsSurfacePage title={title} surface={ui.surface} />
      ) : (
        <AnalyticsPage />
      )
    case 'wallet':
      return <WalletPage title={title} />
    case 'finance-recharges':
      return <FinanceRechargesPage title={title} />
    case 'admin-invoices':
      return <AdminInvoicesPage title={title} />
    case 'wallet-recharge':
      return <WalletRechargePage title={title} />
    case 'wallet-recharge-admin':
      return <WalletRechargeAdminPage title={title} />
    case 'notice-board':
      return <NoticeBoardPage title={title} />
    case 'team-reports':
      return <TeamReportsPage title={title} />
    case 'daily-report-form':
      return <DailyReportFormPage title={title} />
    case 'settings':
      return <SettingsPage />
    case 'leaderboard':
      return <LeaderboardPage title={title} />
    case 'live-session':
      return <LiveSessionPage title={title} />
    case 'community-training':
      return <CommunityTrainingPage title={title} />
    case 'budget-export':
      return <BudgetExportPage title={title} />
    case 'settings-app':
      return <SettingsAppPage title={title} />
    case 'settings-help':
      return <SettingsHelpPage title={title} />
    case 'settings-org-tree':
      return <SettingsOrgTreePage title={title} />
    case 'all-members':
      return <AllMembersPage title={title} />
    case 'shell-api':
      return <ShellStubPage title={title} apiPath={ui.apiPath} />
    default: {
      const _exhaustive: never = ui
      return _exhaustive
    }
  }
}

/**
 * Single outlet for all `/dashboard/*` segments — avoids dozens of duplicate routes.
 */
export function DashboardNestedPage() {
  const { '*': splat } = useParams()
  const path = (splat ?? '').replace(/^\/+|\/+$/g, '')
  const { role: navRole, isPending: rolePending } = useDashboardShellRole()

  const leadDetailMatch = /^work\/leads\/(\d+)$/.exec(path)
  if (leadDetailMatch) {
    const leadId = parseInt(leadDetailMatch[1], 10)
    return <LeadDetailPage leadId={leadId} />
  }

  const trackingDetailMatch = /^team\/tracking\/(\d+)$/.exec(path)
  if (trackingDetailMatch) {
    if (rolePending) {
      return (
        <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full max-w-2xl" />
        </div>
      )
    }
    if (!navRole || (navRole !== 'admin' && navRole !== 'leader')) {
      return <Navigate to="/dashboard" replace />
    }
    const targetUserId = parseInt(trackingDetailMatch[1], 10)
    return <TeamTrackingDetailPage title="Tracking detail" userId={targetUserId} />
  }

  if (!path || !dashboardChildPathSet.has(path)) {
    return <Navigate to="/dashboard" replace />
  }

  const def = getDashboardChildRoute(path)

  if (!def) {
    return <Navigate to="/dashboard" replace />
  }

  if (rolePending) {
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    )
  }

  if (!navRole || !routeDefAccessible(def, navRole)) {
    return <Navigate to="/dashboard" replace />
  }

  const title = resolveTitleForPath(path, navRole) ?? path

  switch (def.surface) {
    case 'placeholder':
      return <DashboardPlaceholderPage title={title} />
    case 'dashboard-home':
      return <Navigate to="/dashboard" replace />
    case 'full':
      return renderFullUi(def.ui, title)
    default: {
      const _exhaustive: never = def
      return _exhaustive
    }
  }
}
