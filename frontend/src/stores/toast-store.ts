import { create } from 'zustand'

type ToastType = 'success' | 'error' | 'warning' | 'info'

type Toast = {
  id: string
  type: ToastType
  message: string
}

type ToastState = {
  toasts: Toast[]
  addToast: (params: { type: ToastType; message: string }) => void
  dismissToast: (id: string) => void
  clearToasts: () => void
}

let _nextId = 0

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: ({ type, message }) => {
    const id = `toast-${++_nextId}-${Date.now()}`
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id, type, message }],
    }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearToasts: () => set({ toasts: [] }),
}))
