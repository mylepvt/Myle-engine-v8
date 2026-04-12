import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { isRole, type Role } from '@/types/role'

/**
 * Dashboard shell role: JWT **or** admin “view as” preview (nav only — API enforces real permissions).
 */
export function useDashboardShellRole(): {
  role: Role | null
  /** JWT role from `/auth/me` (never spoofed). */
  serverRole: Role | null
  /** True when admin is previewing leader/team nav. */
  isAdminPreviewing: boolean
  /** True only on first paint before `/me` is available (no cache). */
  isPending: boolean
  setViewAsRole: (r: Role | null) => void
} {
  const { data: me, isPending } = useAuthMeQuery()
  const viewAs = useShellPreviewStore((s) => s.viewAsRole)
  const setViewAsRole = useShellPreviewStore((s) => s.setViewAsRole)

  if (isPending && me === undefined) {
    return {
      role: null,
      serverRole: null,
      isAdminPreviewing: false,
      isPending: true,
      setViewAsRole,
    }
  }
  const serverRole =
    me?.authenticated && isRole(me.role) ? (me.role as Role) : null

  if (serverRole === null) {
    return {
      role: null,
      serverRole: null,
      isAdminPreviewing: false,
      isPending: false,
      setViewAsRole,
    }
  }

  if (serverRole === 'admin' && viewAs && isRole(viewAs)) {
    return {
      role: viewAs,
      serverRole,
      isAdminPreviewing: viewAs !== 'admin',
      isPending: false,
      setViewAsRole,
    }
  }

  return {
    role: serverRole,
    serverRole,
    isAdminPreviewing: false,
    isPending: false,
    setViewAsRole,
  }
}
