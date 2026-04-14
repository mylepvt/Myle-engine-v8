import {
  playUiSelect,
  playUiToggleOff,
  playUiToggleOn,
  playUiType,
} from '@/lib/ui-sound'

let lastTypeAt = 0

function targetInSilentZone(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  return Boolean(el.closest('[data-ui-silent], [data-ui-sound="silent"]'))
}

/**
 * Document-level listeners so native inputs get **type** / **select** / **toggle**
 * sounds without touching every field (snd-lib parity with easy-setup targets).
 */
export function mountUiSoundGlobals(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.repeat) return
    if (targetInSilentZone(e.target)) return
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.isContentEditable) return
    if (
      !t.matches(
        'textarea, input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range])',
      )
    ) {
      return
    }
    const inp = t as HTMLInputElement
    const allowed = new Set(['text', 'email', 'search', 'tel', 'url', 'password', 'number'])
    if (t.tagName === 'INPUT' && !allowed.has(inp.type)) return
    const now = Date.now()
    if (now - lastTypeAt < 40) return
    lastTypeAt = now
    playUiType()
  }

  const onChange = (e: Event) => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (targetInSilentZone(t)) return
    if (t.matches('input[type="checkbox"]')) {
      const c = t as HTMLInputElement
      if (c.checked) playUiToggleOn()
      else playUiToggleOff()
      return
    }
    if (t.matches('input[type="radio"]')) {
      playUiSelect()
      return
    }
    if (t.matches('select')) {
      playUiSelect()
    }
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('change', onChange, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('change', onChange, true)
  }
}
