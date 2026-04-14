import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark' | 'system' | 'transparent'

type UiFeedbackState = {
  theme: ThemePreference
  soundEnabled: boolean
  hapticsEnabled: boolean
  /** Running streak of rapid consecutive interactions (resets after 3 s idle). */
  streakCount: number
  /** Timestamp of last interaction for streak tracking. */
  _lastInteractionAt: number
  /** Local "satisfaction" score from UI interactions (persisted; not server currency). */
  satisfactionPoints: number

  setTheme: (theme: ThemePreference) => void
  cycleTheme: () => void
  setSoundEnabled: (enabled: boolean) => void
  toggleSound: () => void
  setHapticsEnabled: (enabled: boolean) => void
  toggleHaptics: () => void
  addSatisfactionPoints: (amount?: number) => void
  /** Increment streak; returns new streak count. */
  incrementStreak: () => number
  resetStreak: () => void
}

export const useUiFeedbackStore = create<UiFeedbackState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      soundEnabled: true,
      hapticsEnabled: true,
      streakCount: 0,
      _lastInteractionAt: 0,
      satisfactionPoints: 0,

      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const order: ThemePreference[] = ['light', 'dark', 'system', 'transparent']
        const i = order.indexOf(get().theme)
        set({ theme: order[(i + 1) % order.length] })
      },
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      toggleSound: () => set({ soundEnabled: !get().soundEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      toggleHaptics: () => set({ hapticsEnabled: !get().hapticsEnabled }),
      addSatisfactionPoints: (amount = 1) =>
        set((s) => ({
          satisfactionPoints: Math.min(9_999_999, s.satisfactionPoints + Math.max(0, amount)),
        })),
      incrementStreak: () => {
        const now = Date.now()
        const s = get()
        const elapsed = now - s._lastInteractionAt
        // Reset streak if more than 3 s since last action
        const next = elapsed > 3000 ? 1 : s.streakCount + 1
        set({ streakCount: next, _lastInteractionAt: now })
        return next
      },
      resetStreak: () => set({ streakCount: 0, _lastInteractionAt: 0 }),
    }),
    {
      name: 'myle-ui-feedback',
      partialize: (s) => ({
        theme: s.theme,
        soundEnabled: s.soundEnabled,
        hapticsEnabled: s.hapticsEnabled,
        satisfactionPoints: s.satisfactionPoints,
        streakCount: s.streakCount,
        _lastInteractionAt: s._lastInteractionAt,
      }),
    },
  ),
)
