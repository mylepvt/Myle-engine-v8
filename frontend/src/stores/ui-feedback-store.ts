import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark' | 'system' | 'transparent'

type UiFeedbackState = {
  theme: ThemePreference
  satisfactionPoints: number

  setTheme: (theme: ThemePreference) => void
  cycleTheme: () => void
  addSatisfactionPoints: (amount?: number) => void
}

export const useUiFeedbackStore = create<UiFeedbackState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      satisfactionPoints: 0,

      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const order: ThemePreference[] = ['light', 'dark', 'system', 'transparent']
        const i = order.indexOf(get().theme)
        set({ theme: order[(i + 1) % order.length] })
      },
      addSatisfactionPoints: (amount = 1) =>
        set((s) => ({
          satisfactionPoints: Math.min(9_999_999, s.satisfactionPoints + Math.max(0, amount)),
        })),
    }),
    {
      name: 'myle-ui-feedback',
      partialize: (s) => ({
        theme: s.theme,
        satisfactionPoints: s.satisfactionPoints,
      }),
    },
  ),
)
