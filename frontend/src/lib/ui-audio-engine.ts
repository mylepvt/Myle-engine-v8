/**
 * Shared Web Audio graph: one AudioContext, compressor + master gain → destination.
 * UI samples and synth one-shots both route through here for consistent levels.
 */

let _ctx: AudioContext | null = null
let _master: DynamicsCompressorNode | null = null
let _masterGain: GainNode | null = null

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) {
      _ctx = new AudioContext()
      _master = _ctx.createDynamicsCompressor()
      _master.threshold.value = -18
      _master.knee.value = 8
      _master.ratio.value = 4
      _master.attack.value = 0.003
      _master.release.value = 0.15

      _masterGain = _ctx.createGain()
      _masterGain.gain.value = 0.72

      _master.connect(_masterGain)
      _masterGain.connect(_ctx.destination)
    }
    return _ctx
  } catch {
    return null
  }
}

/** Output node for oscillators / buffer sources (same chain as legacy ui-sounds). */
export function getDestination(ac: AudioContext): AudioNode {
  return _master ?? ac.destination
}

export async function resumeAudioContext(ac: AudioContext): Promise<void> {
  if (ac.state === 'suspended') {
    try {
      await ac.resume()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Returns the context only once it is `running` (after resume from a gesture).
 * Avoid scheduling one-shots while still suspended — they may be silent on mobile.
 */
export async function getReadyAudioContext(): Promise<AudioContext | null> {
  const ac = getAudioContext()
  if (!ac) return null
  await resumeAudioContext(ac)
  return ac.state === 'running' ? ac : null
}

/** Fire-and-forget resume from sync handlers (e.g. first pointerdown). */
export function primeAudioContextSync(): void {
  if (typeof window === 'undefined') return
  try {
    const ac = getAudioContext()
    if (ac?.state === 'suspended') void ac.resume()
  } catch {
    /* ignore */
  }
}

/**
 * Await from click/submit handlers so iOS treats the chain as user-initiated.
 */
export async function unlockUiAudioFromUserGesture(): Promise<void> {
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
}
