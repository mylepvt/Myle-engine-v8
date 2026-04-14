import { describe, expect, it } from 'vitest'

import { mergeTopicBatches } from '@/lib/merge-topic-batches'

describe('mergeTopicBatches', () => {
  it('dedupes while preserving first-seen order', () => {
    expect(
      mergeTopicBatches([
        ['leads', 'team'],
        ['wallet', 'leads'],
        ['team'],
      ]),
    ).toEqual(['leads', 'team', 'wallet'])
  })

  it('returns empty for empty input', () => {
    expect(mergeTopicBatches([])).toEqual([])
  })
})
