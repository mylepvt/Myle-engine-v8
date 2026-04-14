/** Merge WS invalidate topic batches in order, deduping topics. */
export function mergeTopicBatches(batches: string[][]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const batch of batches) {
    for (const t of batch) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }
  return out
}
