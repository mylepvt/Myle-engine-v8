/**
 * Design-system guardrail: text sizes must come from the type scale in
 * tailwind.config.js (ds-display / ds-h1..h3 / ds-body / ds-caption / ds-label /
 * ds-micro, or Tailwind's text-xs+). Arbitrary pixel/rem sizes made the
 * app inconsistent and unreadable on phones (sub-11px text).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const ARBITRARY_FONT_SIZE = /\btext-\[[0-9.]+(?:px|rem|em)\]/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const isSource = /\.(tsx?|css)$/.test(name) && !name.endsWith('.d.ts') && !name.endsWith('design-system.test.ts')
    return isSource ? [path] : []
  })
}

describe('design system', () => {
  it('uses only type-scale font sizes (no text-[Npx] / text-[Nrem])', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const hits = readFileSync(file, 'utf8').match(ARBITRARY_FONT_SIZE) ?? []
      return hits.map((hit) => `${relative(SRC, file)}: ${hit}`)
    })
    expect(offenders).toEqual([])
  })
})
