/** 24h window from current stage anchor — overdue returns negative remaining ms. */
export function timerRemainingMs(
  lastActionIso: string | null | undefined,
  createdAtIso: string,
  nowMs: number = Date.now(),
): number {
  const anchor = lastActionIso?.trim() ? new Date(lastActionIso).getTime() : new Date(createdAtIso).getTime()
  if (Number.isNaN(anchor)) return 0
  const end = anchor + 24 * 60 * 60 * 1000
  return end - nowMs
}

export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  if (ms < 0) return `+${h}h ${m}m overdue`
  return `${h}h ${m}m`
}
