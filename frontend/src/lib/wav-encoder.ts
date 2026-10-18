/**
 * Minimal mono 16-bit PCM WAV encoder for voice notes.
 *
 * Used when the browser's MediaRecorder can't start (seen on iPhone Safari): we capture raw
 * samples through Web Audio and package them as WAV, which every browser can play.
 */

export const WAV_SAMPLE_RATE = 16_000

/** Concatenate captured chunks and resample (linear) from `inputRate` to `outputRate`. */
export function resampleChunks(chunks: Float32Array[], inputRate: number, outputRate: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const joined = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    joined.set(c, offset)
    offset += c.length
  }
  if (!total || inputRate === outputRate) return joined

  const ratio = inputRate / outputRate
  const outLength = Math.max(1, Math.floor(total / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const right = Math.min(left + 1, total - 1)
    const frac = pos - left
    out[i] = joined[left] * (1 - frac) + joined[right] * frac
  }
  return out
}

/** Build a WAV file (RIFF header + 16-bit little-endian PCM) from mono float samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
