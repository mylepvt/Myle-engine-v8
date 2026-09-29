import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge must know our design-system font sizes (tailwind.config.js
 * `fontSize`). Without this it treats `text-ds-*` as a text *colour*, so
 * `cn('text-ds-caption', 'text-muted-foreground')` silently dropped the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['ds-display', 'ds-h1', 'ds-h2', 'ds-h3', 'ds-body', 'ds-caption', 'ds-label', 'ds-micro'] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Short relative label for list cards (no extra deps). */
export function formatRelativeTimeShort(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diffSec = Math.round((nowMs - t) / 1000)
  if (diffSec < 45) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
