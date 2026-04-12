/**
 * Haptic feedback library.
 *
 * Uses navigator.vibrate (Vibration API). **iPhone Safari does not expose
 * vibration from web pages** (API missing / no-op) — only native apps get
 * Taptic. Android Chrome works. Calls remain safe everywhere.
 *
 * Pattern notation: [on, off, on, off…] in milliseconds.
 */

/** True when the browser can actually vibrate (typically Android/desktop Chrome). */
export function browserSupportsVibration(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.vibrate === 'function'
}

function vibe(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch { /* ignore */ }
}

/** Ultra-light tap — checkbox, radio, small UI element. */
export function hapticSelection(): void {
  vibe(6)
}

/** Standard button/link tap. */
export function hapticTapLight(): void {
  vibe(10)
}

/** Medium tap — toggle switches, tab change, nav item. */
export function hapticTapMedium(): void {
  vibe(20)
}

/** Heavy tap — primary action button, form submit. */
export function hapticTapHeavy(): void {
  vibe(35)
}

/** Single solid impact — drag drop, card move. */
export function hapticImpact(): void {
  vibe(40)
}

/** Success — save confirmed, creation done. */
export function hapticSuccess(): void {
  vibe([12, 24, 18])
}

/** Strong success — enrollment, payment received, level up. */
export function hapticSuccessStrong(): void {
  vibe([15, 20, 25, 15, 35])
}

/** Error / reject — gentle double pulse so it doesn't feel like a crash. */
export function hapticError(): void {
  vibe([50, 30, 50])
}

/** Warning — soft double tap. */
export function hapticWarning(): void {
  vibe([20, 40, 20])
}

/** Coin / points earned — rapid flutter, feels like coins dropping. */
export function hapticCoin(): void {
  vibe([8, 10, 8, 10, 8])
}

/** Streak / combo — escalating pattern based on level (1–7). */
export function hapticStreak(level: number): void {
  if (level <= 2) {
    vibe([10, 15, 12])
  } else if (level <= 4) {
    vibe([10, 12, 14, 12, 16])
  } else {
    vibe([12, 10, 16, 10, 20, 10, 28])
  }
}

/** Notification ping — two gentle taps. */
export function hapticNotification(): void {
  vibe([10, 20, 10])
}

/** Delete / remove — single soft thud. */
export function hapticDelete(): void {
  vibe(30)
}
