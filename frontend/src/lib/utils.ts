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

const LOGIN_ID = /^[a-z]+(-[a-z0-9]+)+$/i

/** "Akansha_Kharwar" / "anushka_jaiswal" → "Akansha Kharwar" / "Anushka Jaiswal".
 * Login ids such as "fbo-leader-001" are left as they are. Mirrors backend `person_name`. */
export function personName(raw: string | null | undefined, fallback = ''): string {
  const text = (raw ?? '').trim()
  if (!text || LOGIN_ID.test(text)) return text || fallback
  return text
    .replace(/[_\s]+/g, ' ')
    .split(' ')
    .map((w) => (w && w[0] === w[0].toLowerCase() && w[0] !== w[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function firstNameOf(raw: string | null | undefined, fallback = ''): string {
  return personName(raw).split(' ')[0] || fallback
}
