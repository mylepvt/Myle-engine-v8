import { create } from 'zustand'

export type CallToCloseState = {
  activeLeadId: number | null
  callMode: boolean
  outcomeLeadId: number | null

  setActiveLeadId: (id: number | null) => void
  toggleCallMode: () => void
  setOutcomeLeadId: (id: number | null) => void
}

export const useCallToCloseStore = create<CallToCloseState>((set) => ({
  activeLeadId: null,
  callMode: false,
  outcomeLeadId: null,

  setActiveLeadId: (id) => set({ activeLeadId: id }),
  toggleCallMode: () => set((s) => ({ callMode: !s.callMode })),
  setOutcomeLeadId: (id) => set({ outcomeLeadId: id }),
}))
