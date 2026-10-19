import { describe, expect, it } from 'vitest'

import { project, rubberband } from '@/lib/springs'

describe('project', () => {
  it('matches the exponential-decay projection (0.998 → ~0.5 px per px/s)', () => {
    expect(project(0)).toBe(0)
    expect(project(1000)).toBeCloseTo(499, 0)
    expect(project(-1000)).toBeCloseTo(-499, 0)
  })

  it('a snappier deceleration rate travels less', () => {
    expect(Math.abs(project(1000, 0.99))).toBeLessThan(Math.abs(project(1000)))
  })
})

describe('rubberband', () => {
  it('follows less the further past the edge it goes', () => {
    const dim = 400
    expect(rubberband(0, dim)).toBe(0)
    expect(rubberband(50, dim)).toBeLessThan(50)
    const near = rubberband(50, dim) / 50
    const far = rubberband(300, dim) / 300
    expect(far).toBeLessThan(near)
    // Never travels past the element's own size × constant.
    expect(rubberband(1e6, dim)).toBeLessThan(dim)
  })

  it('is symmetric', () => {
    expect(rubberband(-80, 300)).toBeCloseTo(-rubberband(80, 300))
  })
})
