import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

const STORAGE_KEY = 'myle.home.work-open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** The role dashboard (stats, wins, leaderboard…) folded under one heading below the learning rails. */
export function HomeWorkSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(readOpen)

  function toggle() {
    setOpen((cur) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, cur ? '0' : '1')
      } catch {
        /* storage unavailable — the choice just won't be remembered */
      }
      return !cur
    })
  }

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="home-work-dashboard"
        className="jw-row press flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span>
          <span className="block text-ds-h3 font-semibold text-foreground">My Work Dashboard</span>
          <span className="block text-ds-caption text-muted-foreground">Today's numbers, wins, leaderboard and tasks</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {/* Always mounted, only hidden: the dashboard's own effects (login ping for
          XP, live queries) must keep running exactly as when it was the whole Home. */}
      <div id="home-work-dashboard" hidden={!open} className="pt-4">
        {children}
      </div>
    </section>
  )
}
