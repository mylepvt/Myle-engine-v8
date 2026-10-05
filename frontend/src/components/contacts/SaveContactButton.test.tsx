import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SaveContactButton } from './SaveContactButton'

const role = vi.hoisted(() => ({ serverRole: 'admin' as string | null }))
vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => ({ serverRole: role.serverRole }),
}))

describe('SaveContactButton', () => {
  it('shows for admin when the lead has a phone', () => {
    role.serverRole = 'admin'
    render(<SaveContactButton leadId={5} hasPhone />)
    expect(screen.getByRole('button', { name: /save contact to phone/i })).toBeInTheDocument()
  })

  it('is hidden for leaders and team, and without a phone', () => {
    role.serverRole = 'leader'
    const { container, rerender } = render(<SaveContactButton leadId={5} hasPhone />)
    expect(container).toBeEmptyDOMElement()
    role.serverRole = 'admin'
    rerender(<SaveContactButton leadId={5} hasPhone={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
