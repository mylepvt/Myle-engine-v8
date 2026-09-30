/**
 * Every dropdown uses <NativeSelect> (truncating label + invisible native select),
 * so the global dashboard `select` styles never leak and Android/iOS look the same.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const ALLOWED = new Set(['components/ui/native-select.tsx'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe('dropdowns', () => {
  it('use NativeSelect instead of a raw <select>', () => {
    const offenders = sourceFiles(SRC)
      .map((f) => relative(SRC, f))
      .filter((rel) => !ALLOWED.has(rel) && /<select\b/.test(readFileSync(join(SRC, rel), 'utf8')))
    expect(offenders).toEqual([])
  })
})
