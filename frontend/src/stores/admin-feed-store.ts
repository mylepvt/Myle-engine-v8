import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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
  initialized: boolean
  _refreshFn: (() => void) | null
  pushEntry: (entry: AdminActivityEntry) => void
  setInitialEntries: (entries: AdminActivityEntry[], replace?: boolean) => void
  markAllRead: () => void
  setPaused: (v: boolean) => void
  setRefreshFn: (fn: () => void) => void
  refresh: () => void
}

const MAX_ENTRIES = 500

export const useAdminFeedStore = create<AdminFeedState>()(
  persist(
    (set, get) => ({
      entries: [],
      unreadCount: 0,
      paused: false,
      initialized: false,
      _refreshFn: null,

      pushEntry: (entry) => {
        set((s) => {
          const next = [entry, ...s.entries].slice(0, MAX_ENTRIES)
          return {
            entries: next,
            initialized: true,
            unreadCount: s.paused ? s.unreadCount + 1 : 0,
          }
        })
      },

      setInitialEntries: (initial, replace = false) =>
        set((s) => {
          // Explicit refresh: swap in the fresh list wholesale.
          if (replace) {
            return { entries: initial.slice(0, MAX_ENTRIES), initialized: true }
          }
          // Initial seed: MERGE fresh REST with whatever is persisted/live by id,
          // then sort newest-first. The old length-based guard kept stale
          // localStorage when the fresh list wasn't longer (e.g. both 50) — so the
          // feed showed days-old data after reload. Merging fixes that while still
          // preserving any live SSE entries that arrived first.
          const byId = new Map<string, AdminActivityEntry>()
          for (const e of s.entries) byId.set(e.id, e)
          for (const e of initial) byId.set(e.id, e)
          const merged = Array.from(byId.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_ENTRIES)
          return { entries: merged, initialized: true }
        }),

      markAllRead: () => set({ unreadCount: 0 }),

      setPaused: (v) => set({ paused: v }),

      setRefreshFn: (fn) => set({ _refreshFn: fn }),

      refresh: () => get()._refreshFn?.(),
    }),
    {
      name: 'admin-activity-feed',
      partialize: (state) => ({ entries: state.entries }),
      // Guard storage so the store works in envs without localStorage
      // (tests / SSR) instead of throwing on persist writes.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
    },
  ),
)
