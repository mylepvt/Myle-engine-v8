/**
 * Every modal goes through <Sheet> (springs, drag-to-dismiss, Escape, Back,
 * focus trap, scroll lock). A hand-rolled `fixed inset-0` overlay with the
 * keyboard-safe classes skips all of that.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const ALLOWED = new Set(['components/ui/sheet.tsx'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe('modals', () => {
  it('use <Sheet> instead of a hand-rolled keyboard-safe overlay', () => {
    const offenders = sourceFiles(SRC)
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((rel) => !ALLOWED.has(rel) && /keyboard-safe-(modal|sheet)/.test(readFileSync(join(SRC, rel), 'utf8')))
    expect(offenders).toEqual([])
  })
})
