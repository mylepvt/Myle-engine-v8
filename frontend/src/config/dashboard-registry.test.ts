import { describe, expect, it } from 'vitest'

import {
  getDashboardChildRoute,
  resolveTitleForPath,
  routeDefAccessible,
} from '@/config/dashboard-registry'

describe('dashboard-registry', () => {
  it('resolves work/leads to leads surface', () => {
    const def = getDashboardChildRoute('work/leads')
    expect(def?.surface).toBe('full')
    if (def?.surface === 'full' && def.ui.kind === 'leads') {
      expect(def.ui.listMode).toBe('active')
    } else {
      throw new Error('expected leads full surface')
    }
  })

  it('resolveTitleForPath uses labelByRole for admin on work/leads', () => {
    expect(resolveTitleForPath('work/leads', 'admin')).toBe('All Leads')
    expect(resolveTitleForPath('work/leads', 'team')).toBe('Calling Board')
  })

  it('routeDefAccessible allows valid route for allowed role', () => {
    const def = getDashboardChildRoute('work/leads')
    expect(def).toBeDefined()
    if (!def || def.surface !== 'full') {
      throw new Error('expected full surface')
    }
    expect(routeDefAccessible(def, 'admin')).toBe(true)
  })
})
