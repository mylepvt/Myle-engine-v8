/**
 * Warm the code for the pages people open most (the tab bar's), so the first tap
 * on each doesn't wait on a download. Each page is its own lazy chunk; importing
 * it early just fills the module cache that React.lazy reads from later.
 *
 * Loads one chunk per idle slot so it never competes with the first screen, and
 * skips entirely when the browser asks to save data.
 */
const LOADERS: (() => Promise<unknown>)[] = [
  () => import('@/pages/DashboardNestedPage'),
  () => import('@/pages/LeadsWorkPage'),
  () => import('@/pages/WorkboardPage'),
  () => import('@/pages/FollowUpsWorkPage'),
  () => import('@/pages/TeamMembersPage'),
]

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
}

let started = false

export function prefetchDashboardPages(): void {
  if (started || typeof window === 'undefined') return
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  started = true
  const w = window as IdleWindow
  const whenIdle = (cb: () => void) =>
    w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : window.setTimeout(cb, 300)
  const next = (i: number) => {
    if (i >= LOADERS.length) return
    whenIdle(() => {
      // A failed prefetch is harmless: the page loads on demand as before.
      LOADERS[i]().catch(() => undefined).finally(() => next(i + 1))
    })
  }
  next(0)
}
