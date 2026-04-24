import { describe, expect, it } from 'vitest'

import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'

describe('resolveDashboardSurfaceRole', () => {
  it('keeps real admin controls even while previewing another role', () => {
    expect(resolveDashboardSurfaceRole('team', 'admin')).toBe('admin')
    expect(resolveDashboardSurfaceRole('leader', 'admin')).toBe('admin')
  })

  it('falls back to the authenticated non-admin role', () => {
    expect(resolveDashboardSurfaceRole('leader', 'leader')).toBe('leader')
    expect(resolveDashboardSurfaceRole('team', 'team')).toBe('team')
  })

  it('uses the preview role only when server role is not available yet', () => {
    expect(resolveDashboardSurfaceRole('leader', null)).toBe('leader')
    expect(resolveDashboardSurfaceRole(null, null)).toBeNull()
  })
})
