import { mergeTopicBatches } from '@/lib/merge-topic-batches'

let scrollHotUntil = 0
const pendingBatches: string[][] = []
let pollId: number | undefined

/** Call from dashboard `<main>` scroll (passive is fine). Extends “hot” window on each event. */
export function notifyDashboardMainScrolled(): void {
  scrollHotUntil = performance.now() + 160
}

export function isDashboardMainScrollHot(): boolean {
  return performance.now() < scrollHotUntil
}

type FlushFn = (mergedTopics: string[]) => void

function scheduleFlushWhenCool(flush: FlushFn) {
  if (pollId != null) return
  pollId = window.setInterval(() => {
    if (isDashboardMainScrollHot()) return
    window.clearInterval(pollId!)
    pollId = undefined
    if (pendingBatches.length === 0) return
    const merged = mergeTopicBatches(pendingBatches)
    pendingBatches.length = 0
    if (merged.length > 0) flush(merged)
  }, 100)
}

/**
 * If the user is actively scrolling the main outlet, queue topics and flush once cool.
 * Otherwise invoke flush immediately with the incoming batch.
 */
export function flushRealtimeTopicsOrDefer(
  topics: string[],
  flush: (mergedTopics: string[]) => void,
): void {
  if (isDashboardMainScrollHot()) {
    pendingBatches.push(topics)
    scheduleFlushWhenCool(flush)
    return
  }
  flush(topics)
}

/** Test helper */
export function __resetScrollGateForTests(): void {
  scrollHotUntil = 0
  pendingBatches.length = 0
  clearScrollGatePolling()
}

export function clearScrollGatePolling(): void {
  if (pollId != null) {
    window.clearInterval(pollId)
    pollId = undefined
  }
}
