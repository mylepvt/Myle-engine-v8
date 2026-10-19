import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'

const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let prevActEnv: boolean | undefined

beforeEach(() => {
  // Real scheduling (no act): commit and passive effects land in separate tasks.
  prevActEnv = g.IS_REACT_ACT_ENVIRONMENT
  g.IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(() => {
  g.IS_REACT_ACT_ENVIRONMENT = prevActEnv
  container?.remove()
  container = null
})

const settle = () => new Promise((r) => setTimeout(r, 50))

describe('InAppVideoPlayer', () => {
  it('honours a Play tap that lands before mount effects have run', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const host = container
    const root = createRoot(host)
    // Tap in the microtask right after the commit, before React runs passive
    // effects: the window a busy phone (or CI) widens.
    const tapped = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const play = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Play video'))
        if (!play) return
        observer.disconnect()
        play.click()
        resolve()
      })
      observer.observe(host, { childList: true, subtree: true })
    })
    root.render(<InAppVideoPlayer embedUrl="https://cdn.myle.in/v/day-1.mp4" title="Day 1" playLabel="Play video" />)
    await tapped
    await settle()
    expect(host.querySelector('video[title="Day 1"]')).not.toBeNull()
    root.unmount()
  })

  it('shows the preview again when the video changes', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const host = container
    const root = createRoot(host)
    root.render(<InAppVideoPlayer embedUrl="https://cdn.myle.in/v/a.mp4" title="A" playLabel="Play video" />)
    await settle()
    ;[...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Play video'))!.click()
    await settle()
    expect(host.querySelector('video[title="A"]')).not.toBeNull()
    root.render(<InAppVideoPlayer embedUrl="https://cdn.myle.in/v/b.mp4" title="B" playLabel="Play video" />)
    await settle()
    expect(host.querySelector('video')).toBeNull()
    expect(host.textContent).toContain('Play video')
    root.unmount()
  })
})
