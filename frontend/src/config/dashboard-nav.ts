/**
 * Sidebar nav + path titles — re-exported from `dashboard-registry.ts` (single source of truth).
 */
export type {
  ClientNavFlags,
  DashboardNavItem,
  DashboardNavSection,
} from './dashboard-registry'
export {
  dashboardChildPathSet,
  dashboardNavSections,
  filterDashboardNav,
  itemVisible,
  resolveItemLabel,
  resolveTitleForPath,
} from './dashboard-registry'
