import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { isRole, type Role } from '@/types/role'

type State = {
  /** When signed in as admin, temporarily filter nav like another role (UI only; API stays admin). */
  viewAsRole: Role | null
  setViewAsRole: (r: Role | null) => void
}

export const useShellPreviewStore = create<State>()(
  persist(
    (set) => ({
      viewAsRole: null,
      setViewAsRole: (r) =>
        set({
          viewAsRole: r === null || r === 'admin' ? null : isRole(r) ? r : null,
        }),
    }),
    { name: 'myle-shell-view-as' },
  ),
)
