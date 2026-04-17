/**
 * Sound palette for UI interactions.
 *
 * click.mp3   — light UI click  → buttons, tabs, nav links, anchors
 * tap.mp3     — screen tap      → checkboxes, radios, selects
 * success.mp3 — Apple Pay chime → form saves, login success, confirmations
 *
 * Files live in /public/sounds/ and are streamed via HTMLAudioElement
 * (no bundler involvement, zero JS overhead until first play).
 */

type SoundName = 'click' | 'tap' | 'success'

const pool: Record<SoundName, HTMLAudioElement[]> = {
  click: [],
  tap: [],
  success: [],
}

const POOL_SIZE = 4 // concurrent instances per sound

function preload(name: SoundName) {
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(`/sounds/${name}.mp3`)
    a.preload = 'auto'
    a.volume = name === 'success' ? 0.55 : 0.35
    pool[name].push(a)
  }
}

let ready = false

function ensureReady() {
  if (ready) return
  ready = true
  preload('click')
  preload('tap')
  preload('success')
}

function play(name: SoundName) {
  ensureReady()
  // Round-robin through the pool so rapid taps don't cut each other off
  const list = pool[name]
  const a = list.find((x) => x.paused || x.ended) ?? list[0]
  if (!a) return
  a.currentTime = 0
  a.play().catch(() => {/* autoplay policy — ignore */})
}

/** Light click — buttons, tabs, links */
export function playClick() {
  play('click')
}

/** Tap feedback — checkboxes, radios, selects */
export function playTap() {
  play('tap')
}

/** Success chime — form saves, login, confirmations */
export function playSuccess() {
  play('success')
}
