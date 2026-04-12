/** Light tap — Android / supported devices; no-op elsewhere. */
export function hapticTapLight(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    navigator.vibrate(10)
  } catch {
    /* ignore */
  }
}

/** Success / confirmation — slightly longer pattern. */
export function hapticSuccess(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    navigator.vibrate([12, 24, 16])
  } catch {
    /* ignore */
  }
}
