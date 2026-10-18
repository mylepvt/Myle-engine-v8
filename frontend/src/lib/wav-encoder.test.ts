import { describe, expect, it } from 'vitest'

import { encodeWav, resampleChunks } from '@/lib/wav-encoder'

describe('wav encoder', () => {
  it('writes a valid mono 16-bit PCM header and clamps samples', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 4 * 2)
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(blob)
    })
    const view = new DataView(bytes)
    const ascii = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(o + i)))
    expect(ascii(0)).toBe('RIFF')
    expect(ascii(8)).toBe('WAVE')
    expect(ascii(36)).toBe('data')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(40, true)).toBe(8)
    expect(view.getInt16(46, true)).toBe(0x7fff)
    expect(view.getInt16(48, true)).toBe(-0x8000)
    expect(view.getInt16(50, true)).toBe(0x7fff) // 2 clamped to 1
  })

  it('joins chunks and downsamples 48 kHz to 16 kHz', () => {
    const chunk = new Float32Array(4800).fill(0.5)
    const out = resampleChunks([chunk, chunk], 48_000, 16_000)
    expect(out.length).toBe(3200)
    expect(out[0]).toBeCloseTo(0.5)
  })
})
