import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type CallToCloseState = {
  activeLeadId: number | null
  callMode: boolean
  outcomeLeadId: number | null

  setActiveLeadId: (id: number | null) => void
  toggleCallMode: () => void
  setOutcomeLeadId: (id: number | null) => void
}

/**
 * Persisted to sessionStorage so a return from the native phone dialer — which on
 * mobile can cold-reload the PWA — restores the calling board exactly where the
 * user left it: same active lead, call mode, and the outcome modal still open to
 * record the result (fixes "board goes back / same page doesn't reopen").
 */
export const useCallToCloseStore = create<CallToCloseState>()(
  persist(
    (set) => ({
      activeLeadId: null,
      callMode: false,
      outcomeLeadId: null,

      setActiveLeadId: (id) => set({ activeLeadId: id }),
      toggleCallMode: () => set((s) => ({ callMode: !s.callMode })),
      setOutcomeLeadId: (id) => set({ outcomeLeadId: id }),
    }),
    {
      name: 'ctcs-call-to-close',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        activeLeadId: s.activeLeadId,
        callMode: s.callMode,
        outcomeLeadId: s.outcomeLeadId,
      }),
    },
  ),
)
