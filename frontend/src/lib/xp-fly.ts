/**
 * Tiny pub/sub for the XP reward burst. The XP query notices a gain and emits;
 * <XpFlyLayer> (mounted once, app-wide) draws icons rising from the last tap.
 */
export type XpFlyEvent = { amount: number; levelUp?: boolean }

type Listener = (event: XpFlyEvent) => void
const listeners = new Set<Listener>()

export function onXpFly(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitXpFly(event: XpFlyEvent): void {
  if (event.amount <= 0) return
  listeners.forEach((listener) => listener(event))
}
