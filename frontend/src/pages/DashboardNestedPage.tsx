import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import {
  dashboardChildPathSet,
  getDashboardChildRoute,
  resolveTitleForPath,
  routeDefAccessible,
  type FullUiSurface,
} from '@/config/dashboard-registry'
import { PageTransition } from '@/components/ui/motion'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardPlaceholderPage } from '@/pages/DashboardPlaceholderPage'

// Each dashboard page is its own chunk: a team member's phone only downloads the
// screens they open, not every admin page.
const LeadsWorkPage = lazy(() => import('@/pages/LeadsWorkPage').then((m) => ({ default: m.LeadsWorkPage })))
const FollowUpsWorkPage = lazy(() => import('@/pages/FollowUpsWorkPage').then((m) => ({ default: m.FollowUpsWorkPage })))
const LeadGenPage = lazy(() => import('@/pages/LeadGenPage').then((m) => ({ default: m.LeadGenPage })))
const LeadPoolWorkPage = lazy(() => import('@/pages/LeadPoolWorkPage').then((m) => ({ default: m.LeadPoolWorkPage })))
const RecycleBinWorkPage = lazy(() => import('@/pages/RecycleBinWorkPage').then((m) => ({ default: m.RecycleBinWorkPage })))
const TeamApprovalsPage = lazy(() => import('@/pages/TeamApprovalsPage').then((m) => ({ default: m.TeamApprovalsPage })))
const TeamMembersPage = lazy(() => import('@/pages/TeamMembersPage').then((m) => ({ default: m.TeamMembersPage })))
const FlpMinBillingApprovalsPage = lazy(() => import('@/pages/FlpMinBillingApprovalsPage').then((m) => ({ default: m.FlpMinBillingApprovalsPage })))
const SalesApprovalsPage = lazy(() => import('@/pages/SalesApprovalsPage').then((m) => ({ default: m.SalesApprovalsPage })))
const PendingAsProcessPage = lazy(() => import('@/pages/PendingAsProcessPage').then((m) => ({ default: m.PendingAsProcessPage })))
const TrainingHubPage = lazy(() => import('@/pages/TrainingHubPage').then((m) => ({ default: m.TrainingHubPage })))
const WorkboardPage = lazy(() => import('@/pages/WorkboardPage').then((m) => ({ default: m.WorkboardPage })))
const ShellStubPage = lazy(() => import('@/pages/ShellStubPage').then((m) => ({ default: m.ShellStubPage })))
const WalletPage = lazy(() => import('@/pages/WalletPage').then((m) => ({ default: m.WalletPage })))
const LeadDetailPage = lazy(() => import('@/pages/LeadDetailPage').then((m) => ({ default: m.LeadDetailPage })))
const WalletRechargePage = lazy(() => import('@/pages/WalletRechargePage').then((m) => ({ default: m.WalletRechargePage })))
const WalletAdminPage = lazy(() => import('@/pages/WalletAdminPage').then((m) => ({ default: m.WalletAdminPage })))
const NoticeBoardPage = lazy(() => import('@/pages/NoticeBoardPage').then((m) => ({ default: m.NoticeBoardPage })))
const TeamReportsPage = lazy(() => import('@/pages/TeamReportsPage').then((m) => ({ default: m.TeamReportsPage })))
const DailyReportFormPage = lazy(() => import('@/pages/DailyReportFormPage').then((m) => ({ default: m.DailyReportFormPage })))
const CurrentCcPage = lazy(() => import('@/pages/CurrentCcPage').then((m) => ({ default: m.CurrentCcPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
const LiveSessionPage = lazy(() => import('@/pages/LiveSessionPage').then((m) => ({ default: m.LiveSessionPage })))
const TrainingProgressPage = lazy(() => import('@/pages/TrainingProgressPage').then((m) => ({ default: m.TrainingProgressPage })))
const BudgetExportPage = lazy(() => import('@/pages/BudgetExportPage').then((m) => ({ default: m.BudgetExportPage })))
const LeadControlPage = lazy(() => import('@/pages/LeadControlPage').then((m) => ({ default: m.LeadControlPage })))
const SettingsAppPage = lazy(() => import('@/pages/SettingsAppPage').then((m) => ({ default: m.SettingsAppPage })))
const SettingsHelpPage = lazy(() => import('@/pages/SettingsHelpPage').then((m) => ({ default: m.SettingsHelpPage })))
const SettingsOrgTreePage = lazy(() => import('@/pages/SettingsOrgTreePage').then((m) => ({ default: m.SettingsOrgTreePage })))
const AdminInvoicesPage = lazy(() => import('@/pages/AdminInvoicesPage').then((m) => ({ default: m.AdminInvoicesPage })))
const DownloadsPage = lazy(() => import('@/pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage })))
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })))

function PageFallback() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full max-w-2xl" />
    </div>
  )
}

function renderFullUi(ui: FullUiSurface, title: string) {
  switch (ui.kind) {
    case 'leads':
      return <LeadsWorkPage title={title} listMode={ui.listMode} />
    case 'workboard':
      return <WorkboardPage title={title} />
    case 'follow-ups':
      return <FollowUpsWorkPage title={title} />
    case 'lead-gen':
      return <LeadGenPage title={title} />
    case 'lead-pool':
      return <LeadPoolWorkPage title={title} />
    case 'recycle-bin':
      return <RecycleBinWorkPage title={title} />
    case 'team-members':
      return <TeamMembersPage title={title} />
    case 'team-approvals':
      return <TeamApprovalsPage title={title} />
    case 'flp-min-billing':
      return <FlpMinBillingApprovalsPage title={title} />
    case 'sales-approvals':
      return <SalesApprovalsPage title={title} />
    case 'pending-as':
      return <PendingAsProcessPage title={title} />
    case 'lead-control':
      return <LeadControlPage title={title} />
    case 'activity-log':
      return <AuditLogsPage title={title} />
    case 'wallet':
      return <WalletPage title={title} />
    case 'admin-invoices':
      return <AdminInvoicesPage title={title} />
    case 'wallet-recharge':
      return <WalletRechargePage title={title} />
    case 'wallet-admin':
      return <WalletAdminPage title={title} />
    case 'notice-board':
      return <NoticeBoardPage title={title} />
    case 'team-reports':
      return <TeamReportsPage title={title} />
    case 'daily-report-form':
      return <DailyReportFormPage title={title} />
    case 'current-cc':
      return <CurrentCcPage title={title} />
    case 'settings':
      return <SettingsPage />
    case 'leaderboard':
      return <LeaderboardPage title={title} />
    case 'live-session':
      return <LiveSessionPage title={title} />
    case 'training-hub':
      return <TrainingHubPage title={title} />
    case 'training-progress':
      return <TrainingProgressPage title={title} />
    case 'downloads':
      return <DownloadsPage title={title} />
    case 'budget-export':
      return <BudgetExportPage title={title} />
    case 'settings-app':
      return <SettingsAppPage title={title} />
    case 'settings-help':
      return <SettingsHelpPage title={title} />
    case 'settings-org-tree':
      return <SettingsOrgTreePage title={title} />
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
    return (
      <Suspense fallback={<PageFallback />}>
        <LeadDetailPage leadId={leadId} />
      </Suspense>
    )
  }

  // Retarget moved into the Calling Board as a tab — keep old links working.
  if (path === 'work/retarget') {
    return <Navigate to="/dashboard/work/leads?tab=retarget" replace />
  }

  // Enrollment Link page merged into the Calling Board "Enrollment Video" status.
  if (path === 'work/enroll-link') {
    return <Navigate to="/dashboard/work/leads" replace />
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

  let content: ReactNode
  switch (def.surface) {
    case 'placeholder':
      content = <DashboardPlaceholderPage title={title} />
      break
    case 'dashboard-home':
      return <Navigate to="/dashboard" replace />
    case 'full':
      content = renderFullUi(def.ui, title)
      break
    default: {
      const _exhaustive: never = def
      return _exhaustive
    }
  }

  // Smooth enter animation on every route change (keyed by path → re-runs on nav).
  // PageTransition no-ops under prefers-reduced-motion.
  return (
    <PageTransition key={path} className="h-full">
      <Suspense fallback={<PageFallback />}>{content}</Suspense>
    </PageTransition>
  )
}
