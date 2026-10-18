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

const track = { stop: vi.fn() }
const getUserMedia = vi.fn()

describe('VoiceRecorder', () => {
  beforeEach(() => {
    FakeRecorder.instances = []
    FakeRecorder.reject = () => false
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    getUserMedia.mockResolvedValue({ getTracks: () => [track] })
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
