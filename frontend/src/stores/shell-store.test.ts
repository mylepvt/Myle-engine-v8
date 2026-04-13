import { describe, expect, it } from 'vitest'

import { useShellStore } from '@/stores/shell-store'

describe('useShellStore viewport sync', () => {
  it('closes mobile menu when switching to desktop', () => {
    useShellStore.setState({ sidebarOpen: true, mobileMenuOpen: true })
    useShellStore.getState().syncForViewport(false)
    const state = useShellStore.getState()
    expect(state.sidebarOpen).toBe(true)
    expect(state.mobileMenuOpen).toBe(false)
  })
})
