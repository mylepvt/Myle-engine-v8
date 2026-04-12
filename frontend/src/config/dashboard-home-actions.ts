/**
 * Dashboard home: quick actions + hero copy — **single ordered path list**.
 * Who may open each path = `dashboard-route-roles.json` + registry (`routeDefAccessible`);
 * labels = `resolveTitleForPath` / registry (no second copy of “All leads” vs “My leads”).
 */
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  ClipboardCheck,
  GraduationCap,
  Kanban,
  ListTodo,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Waypoints,
} from 'lucide-react'

import {
  type ClientNavFlags,
  getDashboardChildRoute,
  resolveTitleForPath,
  routeDefAccessible,
} from '@/config/dashboard-registry'
import type { Role } from '@/types/role'

export const DASHBOARD_HOME_OVERVIEW_TITLE: Record<Role, string> = {
  admin: 'Admin overview',
  leader: 'Leader overview',
  team: 'Your workspace',
}

/** Display order — filtered by server role + `routeDefAccessible` (same rules as sidebar). */
const HOME_QUICK_ACTION_PATHS: readonly string[] = [
  'work/leads',
  'work/workboard',
  'work/follow-ups',
  'work/retarget',
  'work/archived',
  'work/add-lead',
  'work/lead-pool',
  'work/lead-pool-admin',
  'work/recycle-bin',
  'work/lead-flow',
  'team/enrollment-approvals',
  'team/my-team',
  'finance/wallet',
  'finance/recharges',
  'other/training',
  'intelligence',
]

const PATH_ICONS: Partial<Record<string, LucideIcon>> = {
  'work/leads': Users,
  'work/add-lead': UserPlus,
  'work/recycle-bin': Trash2,
  'work/workboard': Kanban,
  'work/follow-ups': ListTodo,
  'work/retarget': Target,
  'work/archived': Archive,
  'work/lead-flow': Waypoints,
  'work/lead-pool': Users,
  'work/lead-pool-admin': Users,
  'team/enrollment-approvals': ClipboardCheck,
  'team/my-team': Users,
  'finance/wallet': Wallet,
  'finance/recharges': Wallet,
  'other/training': GraduationCap,
  intelligence: Sparkles,
}

export type HomeQuickAction = {
  path: string
  to: string
  label: string
  Icon: LucideIcon
  /** Lead pool total when relevant */
  badgeCount?: number
}

export function getHomeQuickActions(
  role: Role,
  flags: ClientNavFlags,
  opts: { poolTotal: number },
): HomeQuickAction[] {
  const out: HomeQuickAction[] = []
  for (const path of HOME_QUICK_ACTION_PATHS) {
    const def = getDashboardChildRoute(path)
    if (!def) continue
    if (!routeDefAccessible(def, role, flags)) continue
    const Icon = PATH_ICONS[path]
    if (!Icon) continue
    const label = resolveTitleForPath(path, role) ?? def.label
    const poolPaths = new Set(['work/lead-pool', 'work/lead-pool-admin'])
    const badgeCount =
      poolPaths.has(path) && opts.poolTotal > 0 ? opts.poolTotal : undefined
    out.push({
      path,
      to: `/dashboard/${path}`,
      label,
      Icon,
      badgeCount,
    })
  }
  return out
}
