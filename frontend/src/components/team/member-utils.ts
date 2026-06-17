import { roleShortLabel } from '@/types/role'
import type { TeamMemberPublic } from '@/hooks/use-team-query'

export type ResetTarget = Pick<TeamMemberPublic, 'id' | 'fbo_id' | 'email'>

export function memberRoleLabel(role: string): string {
  if (role === 'admin' || role === 'leader' || role === 'team') {
    return roleShortLabel(role)
  }
  return role
}

export function memberRoleBadgeVariant(role: string): 'warning' | 'primary' | 'success' | 'outline' {
  if (role === 'admin') return 'warning'
  if (role === 'leader') return 'primary'
  if (role === 'team') return 'success'
  return 'outline'
}

export function formatMemberTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

export function formatMemberDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        dateStyle: 'medium',
      })
}

export function complianceBadgeVariant(
  level: TeamMemberPublic['compliance_level'],
): 'success' | 'warning' | 'danger' | 'primary' | 'outline' | 'default' {
  switch (level) {
    case 'removed':
      return 'danger'
    case 'final_warning':
    case 'strong_warning':
      return 'warning'
    case 'warning':
      return 'primary'
    case 'grace':
    case 'grace_ending':
      return 'outline'
    case 'clear':
      return 'success'
    default:
      return 'default'
  }
}

export function complianceTone(level: TeamMemberPublic['compliance_level']): string {
  switch (level) {
    case 'removed':
      return 'text-destructive'
    case 'final_warning':
    case 'strong_warning':
      return 'text-warning'
    case 'warning':
      return 'text-primary'
    case 'grace':
    case 'grace_ending':
      return 'text-foreground'
    case 'clear':
      return 'text-success'
    default:
      return 'text-muted-foreground'
  }
}
