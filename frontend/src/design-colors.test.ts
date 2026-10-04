/**
 * Colour guardrails:
 * - no hard-coded hex colours in class names (`bg-[#25D366]`) — use the theme,
 *   `whatsapp-*` or `room-*` tokens from tailwind.config.js;
 * - every opacity modifier (`/12`) must exist in the opacity scale, otherwise
 *   Tailwind silently drops the whole class;
 * - pale hue text (`text-amber-300`) is unreadable on light-mode cards, so it
 *   must come with a `dark:` pair (`text-amber-700 dark:text-amber-300`) unless
 *   the file only draws on an always-dark surface.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — plain JS config file, no type declarations
import config from '../tailwind.config.js'

const SRC = join(__dirname)
const HEX_CLASS = /\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g
const OPACITY = /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border(?:-[trblxy])?|from|to|via|ring|shadow|fill|stroke|outline|divide|placeholder|caret|decoration)-[a-z]+(?:-[a-z]+)*(?:-\d{2,3})?\/(\d+)(?![\w\]%])/g

const PALE_TEXT = /(?<![\w:/[-])text-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300)\b/g
/** Files whose pale text sits on a fixed dark surface (prospect rooms, dark hero, debug overlays). */
const ALWAYS_DARK = new Set([
  'components/dashboard/TeamDashboardHomeModern.tsx',
  'components/layout/DashboardLayout.tsx',
  'components/watch/InAppVideoPlayer.tsx',
  'pages/BatchWatchPage.tsx',
  'pages/ContentWatchPage.tsx',
  'pages/Day2TestPage.tsx',
  'pages/Day6LivePage.tsx',
  'pages/WatchPage.tsx',
])

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

  it('pairs pale hue text with a dark: variant so light mode stays readable', () => {
    const offenders = files
      .filter(([rel]) => !ALWAYS_DARK.has(rel.split('\\').join('/')))
      .flatMap(([rel, text]) =>
        text.split('\n').flatMap((line, i) =>
          [...line.matchAll(PALE_TEXT)]
            .filter((m) => !line.includes(`dark:text-${m[1]}-`))
            .map((m) => `${rel}:${i + 1}: ${m[0]}`),
        ),
      )
    expect(offenders).toEqual([])
  })
})
