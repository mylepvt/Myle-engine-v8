/**
 * Colour guardrails:
 * - no hard-coded hex colours in class names (`bg-[#25D366]`) — use the theme,
 *   `whatsapp-*` or `room-*` tokens from tailwind.config.js;
 * - every opacity modifier (`/12`) must exist in the opacity scale, otherwise
 *   Tailwind silently drops the whole class.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — plain JS config file, no type declarations
import config from '../tailwind.config.js'

const SRC = join(__dirname)
const HEX_CLASS = /\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g
const OPACITY = /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border(?:-[trblxy])?|from|to|via|ring|shadow|fill|stroke|outline|divide|placeholder|caret|decoration)-[a-z]+(?:-[a-z]+)*(?:-\d{2,3})?\/(\d+)(?![\w\]%])/g

const extra = Object.keys(
  ((config as { theme?: { extend?: { opacity?: Record<string, string> } } }).theme?.extend?.opacity ?? {}),
).map(Number)
const ALLOWED = new Set([...Array.from({ length: 21 }, (_, i) => i * 5), ...extra])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const skip = name.endsWith('.d.ts') || /\.test\.tsx?$/.test(name)
    return /\.tsx?$/.test(name) && !skip ? [path] : []
  })
}

describe('colours', () => {
  const files = sourceFiles(SRC).map((f) => [relative(SRC, f), readFileSync(f, 'utf8')] as const)

  it('uses tokens instead of hard-coded hex colours', () => {
    const offenders = files.flatMap(([rel, text]) => (text.match(HEX_CLASS) ?? []).map((m) => `${rel}: ${m}`))
    expect(offenders).toEqual([])
  })

  it('uses only opacity steps that exist in the scale', () => {
    const offenders = files.flatMap(([rel, text]) =>
      [...text.matchAll(OPACITY)].filter((m) => !ALLOWED.has(Number(m[1]))).map((m) => `${rel}: ${m[0]}`),
    )
    expect(offenders).toEqual([])
  })
})
