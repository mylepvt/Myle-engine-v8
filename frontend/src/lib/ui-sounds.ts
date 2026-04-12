let audioCtx: AudioContext | null = null

/** Call from a user gesture (click/touch) so Android/iOS allow audio (especially first play). */
export function primeAudioContextSync(): void {
  if (typeof window === 'undefined') return
  try {
    const ac = ctx()
    if (ac?.state === 'suspended') void ac.resume()
  } catch {
    /* ignore */
  }
}

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  return audioCtx
}

async function ensureRunning(ac: AudioContext) {
  if (ac.state === 'suspended') {
    try {
      await ac.resume()
    } catch {
      /* ignore */
    }
  }
}

/** Short neutral click — buttons, links. */
export async function playUiClickSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(620, t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.045, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.06)
}

/** Soft “satisfaction” chime — legacy default for gamified clicks. */
export async function playUiSatisfactionSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(990, t)
  osc.frequency.exponentialRampToValueAtTime(1320, t + 0.05)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.06, t + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.13)
}

/** Save / create / positive outcome. */
export async function playUiSuccessSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(523.25, t)
  osc.frequency.exponentialRampToValueAtTime(783.99, t + 0.12)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.22)
}

/** Pipeline stage advance (status change). */
export async function playUiStageAdvanceSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  const o1 = ac.createOscillator()
  const o2 = ac.createOscillator()
  const gain = ac.createGain()
  o1.type = 'triangle'
  o2.type = 'triangle'
  o1.frequency.setValueAtTime(440, t)
  o2.frequency.setValueAtTime(554, t + 0.08)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.065, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  o1.connect(gain)
  o2.connect(gain)
  gain.connect(ac.destination)
  o1.start(t)
  o1.stop(t + 0.12)
  o2.start(t + 0.08)
  o2.stop(t + 0.2)
}
