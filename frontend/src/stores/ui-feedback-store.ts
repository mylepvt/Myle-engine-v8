import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'dark'

const THEME_CYCLE_ORDER: ThemePreference[] = ['dark']

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
        const current = get().theme
        const safeCurrent = THEME_CYCLE_ORDER.includes(current) ? current : 'dark'
        const i = THEME_CYCLE_ORDER.indexOf(safeCurrent)
        set({ theme: THEME_CYCLE_ORDER[(i + 1 + THEME_CYCLE_ORDER.length) % THEME_CYCLE_ORDER.length] })
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
