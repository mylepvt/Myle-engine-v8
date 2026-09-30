import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NativeSelect } from '@/components/ui/native-select'

describe('NativeSelect', () => {
  it('shows the selected option label and forwards changes', () => {
    const onChange = vi.fn()
    render(
      <NativeSelect aria-label="Status" value="b" onChange={onChange} className="w-40">
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </NativeSelect>,
    )
    expect(screen.getByText('Bravo', { selector: 'span' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('finds labels inside optgroups and tracks uncontrolled changes', () => {
    render(
      <NativeSelect aria-label="Pick" defaultValue="y">
        <optgroup label="G1">
          <option value="x">Xray</option>
        </optgroup>
        <optgroup label="G2">
          <option value="y">Yankee</option>
        </optgroup>
      </NativeSelect>,
    )
    expect(screen.getByText('Yankee', { selector: 'span' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pick'), { target: { value: 'x' } })
    expect(screen.getByText('Xray', { selector: 'span' })).toBeInTheDocument()
  })
})
