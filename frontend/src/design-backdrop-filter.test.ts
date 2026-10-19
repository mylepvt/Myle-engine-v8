/**
 * The CSS minifier keeps only the -webkit- declaration when `backdrop-filter`
 * comes before `-webkit-backdrop-filter`, so Chrome/Android silently lose the
 * blur (or a `none` fallback). Always write -webkit- first.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('backdrop-filter in index.css', () => {
  it('puts -webkit-backdrop-filter before backdrop-filter', () => {
    const lines = readFileSync(join(__dirname, 'index.css'), 'utf8').split('\n')
    const offenders = lines.flatMap((line, i) =>
      /^\s*backdrop-filter:/.test(line) && /^\s*-webkit-backdrop-filter:/.test(lines[i + 1] ?? '')
        ? [`index.css:${i + 1}`]
        : [],
    )
    expect(offenders).toEqual([])
  })
})
