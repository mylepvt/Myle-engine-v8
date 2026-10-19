/**
 * Run `fn` once the browser has painted the current frame.
 *
 * Use it to put heavy work (rendering the next route) behind the instant
 * feedback for a tap: the tap's state change paints first and its CSS
 * transitions are handed to the compositor, so they keep gliding while the
 * main thread is busy. rAF runs just before the paint; the task queued from
 * it runs just after.
 */
export function afterNextPaint(fn: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(fn, 0)
  })
}
