/** Best-effort light tap feedback (mobile / supported browsers). */
export function hapticLight(ms = 10): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    navigator.vibrate(ms)
  } catch {
    /* ignore */
  }
}
