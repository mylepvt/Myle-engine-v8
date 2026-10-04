/**
 * New-build detection for the installed PWA.
 *
 * A home-screen app is resumed from memory instead of reloaded, so it can keep
 * running an old bundle for days after a deploy (the website reloads and picks
 * it up at once). Every Vite build gives the entry chunk a new hashed name, so
 * comparing the entry script in a fresh `index.html` with the one this page
 * booted from tells us a deploy happened — no backend version endpoint needed.
 */

const ENTRY_SCRIPT_RE = /\/assets\/index-[\w-]+\.js/

function loadedEntryScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  if (!el?.src) return null
  try {
    return new URL(el.src, window.location.origin).pathname
  } catch {
    return null
  }
}

/** True when the server is serving a newer build than the one running here. */
export async function isNewAppVersionAvailable(): Promise<boolean> {
  if (!import.meta.env.PROD) return false
  const current = loadedEntryScript()
  if (!current) return false
  try {
    const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return false
    const match = (await res.text()).match(ENTRY_SCRIPT_RE)
    return match != null && match[0] !== current
  } catch {
    return false // offline / deploy restarting — try again later
  }
}

/** Ask the browser to re-check `/sw.js` now instead of waiting up to 24h. */
export async function checkServiceWorkerUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update()
  } catch {
    /* non-fatal */
  }
}
