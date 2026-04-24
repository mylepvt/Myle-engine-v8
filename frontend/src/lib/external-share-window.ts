function writePendingShell(popup: Window, message: string) {
  try {
    popup.document.title = 'Opening share'
    popup.document.body.innerHTML = `
      <div style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4efe6;color:#10231d;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
        <div style="max-width:320px;text-align:center;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#5a6c64;">Myle</div>
          <div style="margin-top:12px;font-size:16px;font-weight:600;">${message}</div>
        </div>
      </div>
    `
  } catch {
    // Best-effort only.
  }
}

export function reserveExternalShareWindow(message = 'Preparing secure WhatsApp share...'): Window | null {
  if (typeof window === 'undefined') return null
  const popup = window.open('about:blank', '_blank')
  if (!popup) return null
  try {
    popup.opener = null
    writePendingShell(popup, message)
    popup.focus()
  } catch {
    // Ignore popup decoration failures.
  }
  return popup
}

export function completeExternalShareWindow(popup: Window | null, url: string | null | undefined): boolean {
  const target = (url || '').trim()
  if (!target) {
    closeExternalShareWindow(popup)
    return false
  }
  if (popup && !popup.closed) {
    try {
      popup.location.replace(target)
      popup.focus()
      return true
    } catch {
      // Fall through to a direct open attempt.
    }
  }
  try {
    if (window.open(target, '_blank', 'noopener,noreferrer')) {
      return true
    }
  } catch {
    // Fall through to same-tab navigation.
  }
  try {
    window.location.assign(target)
    return true
  } catch {
    return false
  }
}

export function closeExternalShareWindow(popup: Window | null) {
  if (!popup || popup.closed) return
  try {
    popup.close()
  } catch {
    // Ignore close errors.
  }
}
