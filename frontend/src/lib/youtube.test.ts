import { describe, expect, it } from 'vitest'

import { buildEmbeddableVideoUrl, extractYouTubeId, resolveYouTubeWatchUrl } from '@/lib/youtube'

describe('youtube helpers', () => {
  it('extracts ids from mobile and live YouTube links', () => {
    expect(extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ?si=abc123')).toBe('dQw4w9WgXcQ')
  })

  it('extracts ids from shorts and direct ids', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('builds a safe nocookie embed instead of iframeing mobile watch urls', () => {
    expect(
      buildEmbeddableVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be', null),
    ).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&autoplay=1',
    )
  })

  it('keeps a clean external fallback for YouTube videos', () => {
    expect(resolveYouTubeWatchUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ', null)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })
})
