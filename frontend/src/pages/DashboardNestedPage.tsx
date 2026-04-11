import { Navigate, useParams } from 'react-router-dom'

import {
  dashboardChildPathSet,
  getDashboardChildRoute,
  resolveTitleForPath,
  type FullUiSurface,
} from '@/config/dashboard-registry'
import { DashboardPlaceholderPage } from '@/pages/DashboardPlaceholderPage'
import { LeadsWorkPage } from '@/pages/LeadsWorkPage'
import { FollowUpsWorkPage } from '@/pages/FollowUpsWorkPage'
import { IntelligenceWorkPage } from '@/pages/IntelligenceWorkPage'
import { LeadFlowPage } from '@/pages/LeadFlowPage'
import { LeadPoolWorkPage } from '@/pages/LeadPoolWorkPage'
import { RecycleBinWorkPage } from '@/pages/RecycleBinWorkPage'
import { TeamMembersPage } from '@/pages/TeamMembersPage'
import { MyTeamPage } from '@/pages/MyTeamPage'
import { EnrollmentApprovalsPage } from '@/pages/EnrollmentApprovalsPage'
import { AnalyticsSurfacePage } from '@/pages/AnalyticsSurfacePage'
import { SystemSurfacePage } from '@/pages/SystemSurfacePage'
import { RetargetWorkPage } from '@/pages/RetargetWorkPage'
import { WorkboardPage } from '@/pages/WorkboardPage'
import { ShellStubPage } from '@/pages/ShellStubPage'
import { WalletPage } from '@/pages/WalletPage'
import { FinanceRechargesPage } from '@/pages/FinanceRechargesPage'
import { useRoleStore } from '@/stores/role-store'

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
    case 'intelligence':
      return <IntelligenceWorkPage title={title} />
    case 'team-members':
      return <TeamMembersPage title={title} />
    case 'my-team':
      return <MyTeamPage title={title} />
    case 'enrollment-approvals':
      return <EnrollmentApprovalsPage title={title} />
    case 'system':
      return <SystemSurfacePage title={title} surface={ui.surface} />
    case 'analytics':
      return <AnalyticsSurfacePage title={title} surface={ui.surface} />
    case 'wallet':
      return <WalletPage title={title} />
    case 'finance-recharges':
      return <FinanceRechargesPage title={title} />
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
  const role = useRoleStore((s) => s.role)

  if (!path || !dashboardChildPathSet.has(path)) {
    return <Navigate to="/dashboard" replace />
  }

  const def = getDashboardChildRoute(path)
  const title = resolveTitleForPath(path, role) ?? path

  if (!def) {
    return <Navigate to="/dashboard" replace />
  }

  switch (def.surface) {
    case 'stub':
      return <ShellStubPage title={title} apiPath={def.stubApiPath} />
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
