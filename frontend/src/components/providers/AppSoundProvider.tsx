import { type ReactNode, useEffect } from 'react'

import { playAppSound, primeAppSounds } from '@/lib/app-sounds'

// Elements matching these selectors get the tap sound on pointerdown.
const TAP_SELECTOR =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], ' +
  '[role="switch"], [role="radio"], [role="checkbox"], label, ' +
  'select, input[type="checkbox"], input[type="radio"], input[type="range"], ' +
  'input[type="submit"], input[type="button"], input[type="reset"]'

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest(TAP_SELECTOR)
  if (!el) return false
  // Skip disabled elements
  if ((el as HTMLButtonElement).disabled) return false
  if (el.getAttribute('aria-disabled') === 'true') return false
  // Skip elements that already handle their own sounds
  if (el.closest('[data-no-tap-sound]')) return false
  return true
}

export function AppSoundProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let primed = false

    const handlePointerDown = (e: PointerEvent) => {
      // Always prime audio context on first interaction
      if (!primed) {
        primeAppSounds()
        primed = true
      }
      // iOS-style tap sound on interactive elements (pointer = touch or mouse primary)
      if (e.pointerType === 'touch' || (e.pointerType === 'mouse' && e.isPrimary)) {
        if (isInteractive(e.target)) {
          playAppSound('softTap')
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!primed) {
        primeAppSounds()
        primed = true
      }
      // Space / Enter on focused interactive = tap sound
      if ((e.key === ' ' || e.key === 'Enter') && isInteractive(document.activeElement)) {
        playAppSound('softTap')
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true })
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [])

  return <>{children}</>
}
