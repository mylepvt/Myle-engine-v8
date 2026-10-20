import { create } from 'zustand'

type LeadRef = { id: number; name?: string | null; phone?: string | null }

/**
 * The deposit receipt shown right after "Send to Day 1". It lives outside the lead card
 * because the lead leaves the member's board as soon as it is sent.
 */
type DepositReceiptState = {
  lead: LeadRef | null
  show: (lead: LeadRef) => void
  close: () => void
}

export const useDepositReceiptStore = create<DepositReceiptState>((set) => ({
  lead: null,
  show: (lead) => set({ lead }),
  close: () => set({ lead: null }),
}))
