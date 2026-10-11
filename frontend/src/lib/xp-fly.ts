/**
 * Tiny pub/sub for the reward burst. useRewardSound notices new MYLE Points and emits;
 * <XpFlyLayer> (mounted once, app-wide) draws icons rising from the last tap.
 */
/** ``streak`` set = the call that just extended the work streak (flame burst). */
export type XpFlyEvent = { amount: number; levelUp?: boolean; streak?: number }

type Listener = (event: XpFlyEvent) => void
const listeners = new Set<Listener>()

export function onXpFly(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitXpFly(event: XpFlyEvent): void {
  if (event.amount <= 0 && !event.streak) return
  listeners.forEach((listener) => listener(event))
}
