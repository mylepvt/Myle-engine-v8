let audioCtx: AudioContext | null = null

/** Output cap — multiple layers stack; keep below clipping. */
const _G = 0.09

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

function _tone(
  ac: AudioContext,
  t0: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol * _G, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.04)
}

/** Short neutral click — crisp two-tone “UI tick”. */
export async function playUiClickSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  _tone(ac, t, 740, 0.05, 'sine', 0.85)
  _tone(ac, t + 0.022, 1180, 0.04, 'sine', 0.35)
}

/** “Slot” satisfaction — quick bright major arpeggio (addictive micro-reward). */
export async function playUiSatisfactionSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((hz, i) => {
    _tone(ac, t + i * 0.055, hz, 0.11, 'triangle', 0.65 - i * 0.08)
  })
}

/** Save / win — uplifting fifth + octave sparkle. */
export async function playUiSuccessSound() {
  primeAudioContextSync()
  const ac = ctx()
  if (!ac) return
  await ensureRunning(ac)
  const t = ac.currentTime
  _tone(ac, t, 392, 0.1, 'sine', 0.7) // G4
  _tone(ac, t + 0.08, 523.25, 0.12, 'sine', 0.75) // C5
  _tone(ac, t + 0.16, 659.25, 0.14, 'triangle', 0.65) // E5
  _tone(ac, t + 0.22, 1046.5, 0.16, 'sine', 0.45) // C6 ping
}

/** Pipeline stage advance — rising harmonic pair. */
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
  o1.frequency.exponentialRampToValueAtTime(554.37, t + 0.14)
  o2.frequency.setValueAtTime(554.37, t + 0.06)
  o2.frequency.exponentialRampToValueAtTime(659.25, t + 0.18)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.08 * _G / 0.09, t + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  o1.connect(gain)
  o2.connect(gain)
  gain.connect(ac.destination)
  o1.start(t)
  o1.stop(t + 0.2)
  o2.start(t + 0.05)
  o2.stop(t + 0.22)
}
