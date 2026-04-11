import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { isRole, type Role } from '@/types/role'

/**
 * Dashboard IA + labels must follow **JWT / `GET /api/v1/auth/me`** — not the old header “preview” role.
 */
export function useDashboardShellRole(): {
  role: Role | null
  /** True only on first paint before `/me` is available (no cache). */
  isPending: boolean
} {
  const { data: me, isPending } = useAuthMeQuery()
  if (isPending && me === undefined) {
    return { role: null, isPending: true }
  }
  if (me?.authenticated && isRole(me.role)) {
    return { role: me.role, isPending: false }
  }
  return { role: null, isPending: false }
}
