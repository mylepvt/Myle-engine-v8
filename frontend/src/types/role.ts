/**
 * Single source of truth for product roles (admin / leader / team):
 * labels, dev seed emails (aligned with backend `app.constants.roles`), and ordering.
 */

export const ROLE_CATALOG = {
  admin: {
    /** Compact label (header preview, selects). */
    shortLabel: 'Admin',
    /** Full label (e.g. login, docs). */
    label: 'Admin',
    devEmail: 'dev-admin@myle.local',
  },
  leader: {
    shortLabel: 'Leader',
    label: 'Team leader',
    devEmail: 'dev-leader@myle.local',
  },
  team: {
    shortLabel: 'Team',
    label: 'Team member',
    devEmail: 'dev-team@myle.local',
  },
} as const

export type Role = keyof typeof ROLE_CATALOG

/** Stable ordering for selects and nav preview — derived from catalog keys. */
export const ROLES = Object.keys(ROLE_CATALOG) as Role[]

export function roleLabel(role: Role): string {
  return ROLE_CATALOG[role].label
}

export function roleShortLabel(role: Role): string {
  return ROLE_CATALOG[role].shortLabel
}

export function devEmailForRole(role: Role): string {
  return ROLE_CATALOG[role].devEmail
}

export function isRole(value: string | null | undefined): value is Role {
  return value != null && Object.prototype.hasOwnProperty.call(ROLE_CATALOG, value)
}
