import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { VoiceRecorder } from '@/components/notice-board/VoiceRecorder'

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static reject: (options?: MediaRecorderOptions) => boolean = () => false
  static isTypeSupported = (t: string) => t.startsWith('audio/mp4')

  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: MediaStream, public options?: MediaRecorderOptions) {
    if (FakeRecorder.reject(options)) throw new DOMException('unsupported', 'NotSupportedError')
    this.mimeType = options?.mimeType ?? 'audio/mp4'
    FakeRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const track = { stop: vi.fn(), readyState: 'live' }

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  sampleRate = 48_000
  destination = {}
  processor: { onaudioprocess: ((e: unknown) => void) | null } | null = null
  constructor() {
    FakeAudioContext.instances.push(this)
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
  private node() {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }
  createMediaStreamSource() {
    return this.node()
  }
  createAnalyser() {
    return { ...this.node(), fftSize: 0, frequencyBinCount: 4, getByteTimeDomainData: vi.fn() }
  }
  createGain() {
    return { ...this.node(), gain: { value: 1 } }
  }
  createScriptProcessor() {
    this.processor = { ...this.node(), onaudioprocess: null }
    return this.processor
  }
}
const getUserMedia = vi.fn()

describe('VoiceRecorder', () => {
  beforeEach(() => {
    FakeRecorder.instances = []
    FakeRecorder.reject = () => false
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    FakeAudioContext.instances = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    getUserMedia.mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:voice', revokeObjectURL: () => undefined })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    getUserMedia.mockReset()
  })

  it('falls back when Safari refuses the preferred recorder settings', async () => {
    // iPhone: format reported as supported, but the constructor rejects the bitrate option.
    FakeRecorder.reject = (options) => options?.audioBitsPerSecond != null
    const onChange = vi.fn()
    render(<VoiceRecorder onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
    const stop = await screen.findByRole('button', { name: /Stop/ })
    expect(FakeRecorder.instances).toHaveLength(1)
    expect(FakeRecorder.instances[0].options).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2' })

    await act(async () => {
      fireEvent.click(stop)
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:voice' }))
    expect(onChange.mock.calls[0][0].blob.type).toBe('audio/mp4;codecs=mp4a.40.2')
    expect(track.stop).toHaveBeenCalled()
  })

  it('uses browser defaults when every explicit format is refused', async () => {
    FakeRecorder.reject = (options) => options != null
    render(<VoiceRecorder onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
    await screen.findByRole('button', { name: /Stop/ })
    expect(FakeRecorder.instances[0].options).toBeUndefined()
  })

  it('records as WAV through Web Audio when MediaRecorder cannot start (iPhone InvalidStateError)', async () => {
    vi.stubGlobal(
      'MediaRecorder',
      class extends FakeRecorder {
        constructor(stream: MediaStream, options?: MediaRecorderOptions) {
          super(stream, options)
        }
        start() {
          throw new DOMException('bad state', 'InvalidStateError')
        }
      },
    )
    const onChange = vi.fn()
    render(<VoiceRecorder onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
    const stop = await screen.findByRole('button', { name: /Stop/ })
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.processor).not.toBeNull()
    // Two buffers of captured mic audio.
    const buffer = { inputBuffer: { getChannelData: () => new Float32Array(4800).fill(0.25) } }
    ctx.processor!.onaudioprocess!(buffer)
    ctx.processor!.onaudioprocess!(buffer)

    await act(async () => {
      fireEvent.click(stop)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const { blob } = onChange.mock.calls[0][0]
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 3200 * 2) // 9600 samples at 48 kHz → 3200 at 16 kHz
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('switches the iPhone audio session to recording mode, then back to ambient', async () => {
    const session = { type: 'ambient' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    let typeWhenMicOpened = ''
    getUserMedia.mockImplementation(() => {
      typeWhenMicOpened = session.type
      return Promise.resolve({ getTracks: () => [track], getAudioTracks: () => [track] })
    })
    try {
      render(<VoiceRecorder onChange={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
      const stop = await screen.findByRole('button', { name: /Stop/ })
      // In 'ambient' Safari refuses the mic with InvalidStateError.
      expect(typeWhenMicOpened).toBe('play-and-record')
      expect(session.type).toBe('play-and-record')

      await act(async () => {
        fireEvent.click(stop)
      })
      expect(session.type).toBe('ambient')
    } finally {
      delete (navigator as Navigator & { audioSession?: unknown }).audioSession
    }
  })

  it('explains a busy microphone', async () => {
    getUserMedia.mockRejectedValue(new DOMException('busy', 'NotReadableError'))
    render(<VoiceRecorder onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The microphone is busy')
  })

  it('shows the browser error name for unexpected failures', async () => {
    getUserMedia.mockRejectedValue(new DOMException('weird', 'InvalidStateError'))
    render(<VoiceRecorder onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tap to record/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start recording (InvalidStateError)')
  })
})
