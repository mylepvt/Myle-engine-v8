import { describe, expect, it } from 'vitest'

import { cn } from '@/lib/utils'

describe('cn', () => {
  it('keeps design-system font sizes next to a text colour', () => {
    expect(cn('text-ds-micro', 'text-primary-foreground')).toBe('text-ds-micro text-primary-foreground')
    expect(cn('text-ds-caption text-muted-foreground')).toBe('text-ds-caption text-muted-foreground')
  })

  it('still lets a later font size win over an earlier one', () => {
    expect(cn('text-ds-caption', 'text-ds-h2')).toBe('text-ds-h2')
    expect(cn('text-sm', 'text-ds-body')).toBe('text-ds-body')
  })
})
