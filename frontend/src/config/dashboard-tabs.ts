/**
 * Bottom tab bar IA: five tabs, each a hub page that lists its screens as rows.
 * Which tab a registry path belongs to lives here; the paths, labels and role
 * gates still come from `dashboard-registry.ts`.
 */
import {
  BookOpen,
  Briefcase,
  GraduationCap,
  Home,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

import {
  DASHBOARD_ROUTE_DEFS,
  filterDashboardNav,
  type DashboardNavSection,
} from '@/config/dashboard-registry'
import type { Role } from '@/types/role'

export type DashboardTabId = 'home' | 'work' | 'library' | 'meetings' | 'learning'

export type DashboardTab = {
  id: DashboardTabId
  label: string
  /** Hub route under /dashboard ('' = home). */
  path: string
  icon: LucideIcon
}

export const DASHBOARD_TABS: DashboardTab[] = [
  { id: 'home', label: 'Home', path: '', icon: Home },
  { id: 'work', label: 'Work', path: 'work', icon: Briefcase },
  { id: 'library', label: 'Library', path: 'library', icon: BookOpen },
  { id: 'meetings', label: 'Meetings', path: 'meetings', icon: UsersRound },
  { id: 'learning', label: 'Personal Learning', path: 'learning', icon: GraduationCap },
]

/** Hub paths (rendered by `TabHubPage`, not by the registry). */
export const DASHBOARD_HUB_PATHS = ['work', 'library', 'meetings', 'learning'] as const
export type DashboardHubId = (typeof DASHBOARD_HUB_PATHS)[number]

/** Registry paths that live outside the Work tab. Everything else is Work. */
const PATH_TAB: Record<string, DashboardTabId> = {
  '': 'home',
  'system/training': 'library',
  'system/training-progress': 'library',
  'other/downloads': 'library',
  'other/live-session': 'meetings',
  'other/notice-board': 'meetings',
  'other/daily-report': 'meetings',
  'settings/profile': 'learning',
  'settings/app': 'learning',
  'settings/help': 'learning',
  'settings/org-tree': 'learning',
}

/** Section headings on each hub, in order. Work keeps the registry's own sections; Library has its own page. */
const HUB_SECTIONS: Record<Exclude<DashboardHubId, 'work' | 'library'>, { label: string; paths: string[] }[]> = {
  meetings: [
    { label: 'Live', paths: ['other/live-session'] },
    { label: 'Daily', paths: ['other/daily-report', 'other/notice-board'] },
  ],
  learning: [
    { label: 'My Learning', paths: ['system/training'] },
    { label: 'Account', paths: ['settings/profile', 'settings/app', 'settings/help', 'settings/org-tree'] },
  ],
}

const WORK_SECTION_LABEL: Record<string, string> = {
  work: 'Leads',
  team: 'Team',
  finance: 'Wallet',
  deposits: 'Deposits',
  other: 'Community',
  system: 'Admin',
}

export function tabForRegistryPath(path: string): DashboardTabId {
  return PATH_TAB[path] ?? 'work'
}

/** Active tab for a /dashboard/... pathname (nested pages follow their parent). */
export function activeTabForPathname(pathname: string): DashboardTabId {
  const rel = pathname.replace(/^\/dashboard\/?/, '').replace(/\/$/, '')
  if (rel === '') return 'home'
  const hub = DASHBOARD_HUB_PATHS.find((h) => rel === h)
  if (hub) return hub
  // Longest registry path that prefixes the location, e.g. work/leads/42 → work/leads.
  let best = ''
  for (const { path } of DASHBOARD_ROUTE_DEFS) {
    if (path && (rel === path || rel.startsWith(`${path}/`)) && path.length > best.length) {
      best = path
    }
  }
  return best ? tabForRegistryPath(best) : 'work'
}

/** Rows for a hub page, filtered to what this role may open. */
export function hubSections(hub: Exclude<DashboardHubId, 'library'>, role: Role): DashboardNavSection[] {
  const visible = filterDashboardNav(role)
  if (hub === 'work') {
    return visible
      .map((section) => ({
        id: section.id,
        label: WORK_SECTION_LABEL[section.id] ?? section.label,
        items: section.items.filter((item) => item.path !== '' && tabForRegistryPath(item.path) === 'work'),
      }))
      .filter((section) => section.items.length > 0)
  }
  const byPath = new Map(visible.flatMap((s) => s.items).map((item) => [item.path, item]))
  return HUB_SECTIONS[hub]
    .map((section, i) => ({
      id: `${hub}-${i}`,
      label: section.label,
      items: section.paths.flatMap((p) => byPath.get(p) ?? []),
    }))
    .filter((section) => section.items.length > 0)
}
