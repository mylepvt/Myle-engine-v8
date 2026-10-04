/**
 * Token guardrails for colour and radius:
 * - status hues (emerald/green, amber/yellow, red/rose, blue) must use the
 *   theme tokens — `text-success-ink`, `bg-warning/10`, `border-destructive/20`,
 *   `text-info-ink` … — which stay readable in light and dark;
 * - every other raw Tailwind hue (violet, sky, slate, …) is a ratchet: the
 *   count may only go down;
 * - corner radius comes from the scale in tailwind.config.js, never `rounded-[…]`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)

/** Pages and panels drawn on a fixed (always-dark or always-light) surface, not the app theme. */
const FIXED_SURFACE = new Set([
  'components/dashboard/TeamDashboardHomeModern.tsx',
  'components/layout/DashboardLayout.tsx',
  'components/watch/InAppVideoPlayer.tsx',
  'components/watch/VideoProtection.tsx',
  'pages/BatchWatchPage.tsx',
  'pages/CaptureFormPage.tsx',
  'pages/ContentWatchPage.tsx',
  'pages/Day2TestPage.tsx',
  'pages/Day6LivePage.tsx',
  'pages/EnrollmentWatchPage.tsx',
  'pages/WatchPage.tsx',
  // gold / silver / bronze medals are decoration, not status
  'components/ui/rank-badge.tsx',
])

/** Lower this when you replace raw hues with tokens; never raise it. */
const RAW_HUE_BUDGET = 307

const STATUS_HUES = new Set(['red', 'rose', 'amber', 'yellow', 'green', 'emerald', 'blue'])
const RAW_HUE =
  /(?<![\w\-[/])(?:[a-z0-9-]+(?:\[[^\]]*\])?:)*(?:text|bg|border(?:-[trblxy])?|from|to|via|ring|fill|stroke|divide|outline|shadow|decoration|placeholder|caret|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}(?![\w-])/g
const ARBITRARY_RADIUS = /\brounded(?:-[trblxyse]{1,2})?-\[(?!inherit\])[^\]]+\]/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const skip = name.endsWith('.d.ts') || /\.test\.tsx?$/.test(name)
    return /\.tsx?$/.test(name) && !skip ? [path] : []
  })
}

const files = sourceFiles(SRC).map(
  (f) => [relative(SRC, f).split('\\').join('/'), readFileSync(f, 'utf8')] as const,
)

function matches(re: RegExp, filter: (rel: string) => boolean) {
  return files
    .filter(([rel]) => filter(rel))
    .flatMap(([rel, text]) =>
      text.split('\n').flatMap((line, i) => [...line.matchAll(re)].map((m) => ({ at: `${rel}:${i + 1}`, m }))),
    )
}

describe('design tokens', () => {
  const themed = (rel: string) => !FIXED_SURFACE.has(rel)

  it('uses status tokens instead of raw status hues', () => {
    const offenders = matches(RAW_HUE, themed)
      .filter(({ m }) => STATUS_HUES.has(m[1]))
      .map(({ at, m }) => `${at}: ${m[0]}`)
    expect(offenders).toEqual([])
  })

  it(`keeps other raw hues within the ratchet (${RAW_HUE_BUDGET})`, () => {
    expect(matches(RAW_HUE, themed).length).toBeLessThanOrEqual(RAW_HUE_BUDGET)
  })

  it('uses the radius scale instead of arbitrary rounded-[…] values', () => {
    const offenders = matches(ARBITRARY_RADIUS, () => true).map(({ at, m }) => `${at}: ${m[0]}`)
    expect(offenders).toEqual([])
  })
})
