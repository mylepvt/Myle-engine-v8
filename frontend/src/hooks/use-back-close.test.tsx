import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackClose } from '@/hooks/use-back-close'

const tick = () => new Promise((r) => setTimeout(r, 20))

describe('useBackClose', () => {
  beforeEach(() => {
    window.history.replaceState(null, '')
  })

  it('device Back closes the modal', async () => {
    const onClose = vi.fn()
    const start = window.history.length
    renderHook(() => useBackClose({ open: true, onClose }))
    expect(window.history.length).toBe(start + 1)
    expect((window.history.state as { backClose?: boolean }).backClose).toBe(true)

    await act(async () => {
      window.history.back()
      await tick()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closing from the UI removes the placeholder so the next Back works', async () => {
    const onClose = vi.fn()
    const { rerender } = renderHook(({ open }) => useBackClose({ open, onClose }), {
      initialProps: { open: true },
    })
    expect((window.history.state as { backClose?: boolean }).backClose).toBe(true)

    act(() => {
      rerender({ open: false })
    })
    await tick()
    expect((window.history.state as { backClose?: boolean } | null)?.backClose).toBeFalsy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not push a new entry on every render with an inline onClose', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { rerender } = renderHook(() => useBackClose({ open: true, onClose: () => undefined }))
    rerender()
    rerender()
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
  })
})
