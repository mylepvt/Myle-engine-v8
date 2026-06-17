import { type ReactNode, useEffect } from 'react'

import { playAppSound, primeAppSounds } from '@/lib/app-sounds'
import { useXpRewardSound } from '@/hooks/use-xp-reward-sound'

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
  useXpRewardSound()

  useEffect(() => {
    let primed = false
    let touchStartX = 0
    let touchStartY = 0

    const prime = () => {
      if (!primed) {
        primeAppSounds()
        primed = true
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      prime()
      if (e.pointerType === 'touch') {
        touchStartX = e.clientX
        touchStartY = e.clientY
      }
      // Mouse click is always intentional — play immediately
      if (e.pointerType === 'mouse' && e.isPrimary) {
        if (isInteractive(e.target)) {
          playAppSound('tap')
        }
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      // Only play if finger barely moved (< 10px) = real tap, not scroll
      const dx = Math.abs(e.clientX - touchStartX)
      const dy = Math.abs(e.clientY - touchStartY)
      if (dx + dy < 10 && isInteractive(e.target)) {
        playAppSound('tap')
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      prime()
      if ((e.key === ' ' || e.key === 'Enter') && isInteractive(document.activeElement)) {
        playAppSound('tap')
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true })
    window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true })
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('pointerup', handlePointerUp, { capture: true })
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [])

  return <>{children}</>
}
