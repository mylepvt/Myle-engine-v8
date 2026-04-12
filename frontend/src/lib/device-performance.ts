/**
 * Marks `html.perf-low-end` for cheaper paint (blur off, fewer animations, lighter queries).
 * Heuristic: Save-Data / slow network / low deviceMemory / Android with few CPU cores.
 */

export type PerformanceProfile = 'default' | 'low'

let _profile: PerformanceProfile = 'default'

export function initPerformanceProfile(): PerformanceProfile {
  if (typeof window === 'undefined') return 'default'

  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }

  const saveData = nav.connection?.saveData === true
  const slowNet =
    nav.connection?.effectiveType === 'slow-2g' ||
    nav.connection?.effectiveType === '2g'
  const mem = nav.deviceMemory
  const cores = navigator.hardwareConcurrency ?? 8
  const android = /Android/i.test(navigator.userAgent)

  const low =
    saveData ||
    slowNet ||
    (mem != null && mem <= 3) ||
    (android && mem != null && mem <= 4) ||
    (android && cores <= 4)

  if (low) {
    document.documentElement.classList.add('perf-low-end')
    _profile = 'low'
  } else {
    _profile = 'default'
  }

  return _profile
}

export function getPerformanceProfile(): PerformanceProfile {
  return _profile
}

export function isLowEndDevice(): boolean {
  return _profile === 'low'
}
