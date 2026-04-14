/**
 * Shared Web Audio graph: one AudioContext, compressor + master gain → destination.
 */

let _ctx: AudioContext | null = null
let _master: DynamicsCompressorNode | null = null
let _masterGain: GainNode | null = null

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) {
      _ctx = new AudioContext({ latencyHint: 'interactive' })
      _master = _ctx.createDynamicsCompressor()
      _master.threshold.value = -18
      _master.knee.value = 8
      _master.ratio.value = 4
      _master.attack.value = 0.003
      _master.release.value = 0.15

      _masterGain = _ctx.createGain()
      _masterGain.gain.value = 0.78

      _master.connect(_masterGain)
      _masterGain.connect(_ctx.destination)
    }
    return _ctx
  } catch {
    return null
  }
}

export function getDestination(ac: AudioContext): AudioNode {
  return _master ?? ac.destination
}

export async function resumeAudioContext(ac: AudioContext): Promise<void> {
  if (ac.state === 'suspended' || ac.state === 'interrupted') {
    try {
      await ac.resume()
    } catch {
      /* ignore */
    }
  }
}

const running = (ac: AudioContext) => ac.state === 'running'

/**
 * Resume + a few rAF retries (Safari / first-tap). Fast-path when already running.
 */
export async function getReadyAudioContext(): Promise<AudioContext | null> {
  const ac = getAudioContext()
  if (!ac) return null
  if (running(ac)) return ac
  const maxFrames = 3
  for (let i = 0; i < maxFrames; i++) {
    await resumeAudioContext(ac)
    if (running(ac)) return ac
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  return null
}

export function primeAudioContextSync(): void {
  if (typeof window === 'undefined') return
  try {
    const ac = getAudioContext()
    if (ac?.state === 'suspended' || ac?.state === 'interrupted') void ac.resume()
  } catch {
    /* ignore */
  }
}

export async function unlockUiAudioFromUserGesture(): Promise<void> {
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
}
