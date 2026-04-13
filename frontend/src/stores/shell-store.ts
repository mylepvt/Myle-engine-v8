import { create } from 'zustand'

type ShellState = {
  sidebarOpen: boolean
  mobileMenuOpen: boolean
  setSidebarOpen: (open: boolean) => void
  setMobileMenuOpen: (open: boolean) => void
  syncForViewport: (isMobile: boolean) => void
  toggleSidebar: () => void
}

export const useShellStore = create<ShellState>((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  syncForViewport: (isMobile) =>
    set((s) => ({
      sidebarOpen: isMobile ? false : s.sidebarOpen || true,
      mobileMenuOpen: isMobile ? s.mobileMenuOpen : false,
    })),
  toggleSidebar: () =>
    set((s) => ({ sidebarOpen: !s.sidebarOpen, mobileMenuOpen: !s.sidebarOpen })),
}))
