/**
 * In-app UI copy must be English. Prospect-facing WhatsApp messages are the only
 * exception and live in the allow-listed builders below.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const ALLOWED = new Set(['lib/enrollment-send.ts'])
// Unambiguous Hindi/Hinglish words that never appear in English UI copy.
const HINGLISH =
  /\b(kariye|kijiye|dijiye|karo|karein|karega|karegi|nahi|nhi|aapka|aapki|aapke|apna|apni|apne|hoga|hogi|chahiye|kuch|mein|kya|milao|chuka|sabko|gaya|gayi|hogaya)\b/i
const STRING_OR_JSX_TEXT = /(['"`])((?:(?!\1)[^\\]|\\.)*)\1|>([^<>{}]+)</g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const skip = name.endsWith('.d.ts') || /\.test\.tsx?$/.test(name)
    return /\.tsx?$/.test(name) && !skip ? [path] : []
  })
}

describe('UI copy language', () => {
  it('has no Hinglish text outside prospect WhatsApp message builders', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file)
      if (ALLOWED.has(rel)) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
          for (const m of line.matchAll(STRING_OR_JSX_TEXT)) {
            const text = m[2] ?? m[3] ?? ''
            if (HINGLISH.test(text)) offenders.push(`${rel}:${i + 1}: ${text.trim().slice(0, 80)}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})
