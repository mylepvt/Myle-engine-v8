/**
 * App UI uses lucide icons, not emoji (emoji render differently on every
 * platform and can't be themed). An emoji is only allowed where the line above
 * says why: `// emoji-ok: <reason>` (e.g. WhatsApp message text, reactions).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{274C}\u{2728}\u{2B50}]/u

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const skip = name.endsWith('.d.ts') || /\.test\.tsx?$/.test(name)
    return /\.tsx?$/.test(name) && !skip ? [path] : []
  })
}

describe('UI icons', () => {
  it('has no emoji in app UI unless marked `emoji-ok`', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!EMOJI.test(line)) return
        if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return
        if (line.includes('emoji-ok') || (lines[i - 1] ?? '').includes('emoji-ok')) return
        offenders.push(`${relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 80)}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
