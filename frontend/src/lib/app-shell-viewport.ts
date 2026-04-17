/**
 * Keeps `--app-shell-vh` aligned with the visible viewport on mobile browsers.
 *
 * Do not use `Math.max(visualViewport.height, innerHeight)` — on first paint
 * `visualViewport` can be 0; after that `innerHeight` can stay inflated vs the
 * visible area, which pushes fixed chrome (bottom tab bar) below the fold until
 * a later resize/navigation reflow (common on Android Chrome).
 */

export function readAppShellViewportHeightPx(): number {
  if (typeof window === 'undefined') return 0
  const vv = window.visualViewport?.height
  const ih = window.innerHeight
  if (vv != null && vv > 0) return Math.round(vv)
  if (ih > 0) return Math.round(ih)
  return Math.round(document.documentElement.clientHeight || 0)
}

export function syncAppShellViewportHeight(): void {
  if (typeof document === 'undefined') return
  const next = readAppShellViewportHeightPx()
  if (next > 0) {
    document.documentElement.style.setProperty('--app-shell-vh', `${next}px`)
  }
}

/** Re-run after layout settles — first paint + post-navigation (Android Chrome). */
export function scheduleAppShellViewportSync(): void {
  syncAppShellViewportHeight()
  requestAnimationFrame(() => {
    syncAppShellViewportHeight()
    requestAnimationFrame(syncAppShellViewportHeight)
  })
  for (const ms of [0, 32, 100, 250, 450]) {
    window.setTimeout(syncAppShellViewportHeight, ms)
  }
}
