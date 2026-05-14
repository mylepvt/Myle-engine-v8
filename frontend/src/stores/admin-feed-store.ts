import { create } from 'zustand'

export type AdminActivityEntry = {
  id: string
  action: string
  actorId?: string
  actorName?: string
  targetId?: string
  targetType?: string
  description: string
  severity: 'info' | 'warning' | 'error'
  timestamp: number
  metadata?: Record<string, unknown>
}

type AdminFeedState = {
  entries: AdminActivityEntry[]
  unreadCount: number
  paused: boolean
  pushEntry: (entry: AdminActivityEntry) => void
  markAllRead: () => void
  setPaused: (v: boolean) => void
}

const MAX_ENTRIES = 500

export const useAdminFeedStore = create<AdminFeedState>((set) => ({
  entries: [],
  unreadCount: 0,
  paused: false,

  pushEntry: (entry) => {
    set((s) => {
      const next = [entry, ...s.entries].slice(0, MAX_ENTRIES)
      return {
        entries: next,
        unreadCount: s.paused ? s.unreadCount + 1 : 0,
      }
    })
  },

  markAllRead: () => set({ unreadCount: 0 }),

  setPaused: (v) => set({ paused: v }),
}))
