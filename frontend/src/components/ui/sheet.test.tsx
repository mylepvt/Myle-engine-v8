import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sheet } from '@/components/ui/sheet'

afterEach(() => cleanup())

function Harness({ dismissible = true, onClose }: { dismissible?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose?.()
          setOpen(false)
        }}
        label="Edit lead"
        dismissible={dismissible}
      >
        <button type="button">Inside</button>
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
  it('opens as a labelled modal dialog in a portal and locks page scroll', () => {
    const { container } = render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Open'))
    const dialog = screen.getByRole('dialog', { name: 'Edit lead' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('closes on Escape, then unmounts after its exit animation and restores focus', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const trigger = screen.getByText('Open')
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })

  it('ignores Escape while not dismissible', async () => {
    const onClose = vi.fn()
    render(<Harness dismissible={false} onClose={onClose} />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => {})
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('only the top-most sheet answers Escape', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Sheet open onClose={outer} label="Outer">
          <p>outer</p>
        </Sheet>
        <Sheet open onClose={inner} label="Inner">
          <p>inner</p>
        </Sheet>
      </>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('keeps Tab focus inside the panel', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Open'))
    const inside = screen.getByText('Inside')
    inside.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(document.activeElement).toBe(inside)
  })
})
