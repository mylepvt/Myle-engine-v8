import type { Role } from '@/types/role'

/**
 * Admin "view as" should only affect shell/navigation copy, not permission-sensitive
 * work surfaces. Real admin capabilities must stay available everywhere.
 */
export function resolveDashboardSurfaceRole(
  role: Role | null,
  serverRole: Role | null,
): Role | null {
  if (serverRole === 'admin') return 'admin'
  return serverRole ?? role
}
