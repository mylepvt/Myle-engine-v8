/**
 * Every theme colour must accept an opacity modifier. When a colour was a bare
 * `var(--x)`, classes like `bg-muted/60` or `border-border/50` silently compiled
 * to nothing (1,000+ uses across the app rendered without their background/border).
 */
import { describe, expect, it } from 'vitest'

// @ts-expect-error — plain JS config file, no type declarations
import config from '../tailwind.config.js'

type ColorTree = string | { [key: string]: ColorTree }

function flatten(tree: ColorTree, prefix = ''): [string, string][] {
  if (typeof tree === 'string') return [[prefix, tree]]
  return Object.entries(tree).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}-${k}` : k))
}

describe('theme colours', () => {
  it('all support opacity modifiers (<alpha-value>)', () => {
    const colors = ((config as { theme?: { extend?: { colors?: ColorTree } } }).theme?.extend?.colors ?? {}) as ColorTree
    const missing = flatten(colors)
      .filter(([, value]) => value.includes('var(--') && !value.includes('<alpha-value>'))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })
})
