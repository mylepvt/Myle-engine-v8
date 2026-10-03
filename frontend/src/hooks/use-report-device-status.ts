import { useEffect } from 'react'

import { isStandalone } from '@/hooks/use-pwa-install'
import { apiFetch } from '@/lib/api'

export function devicePlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent ?? ''
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function pushPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * Tells the server how this member runs Myle (home-screen app vs browser) and
 * whether notifications are allowed, so the admin can see who still needs setup.
 * Sent on open, when the app comes back to the foreground, and when `pushSubscribed` flips.
 */
export function useReportDeviceStatus(enabled: boolean, pushSubscribed: boolean) {
  useEffect(() => {
    if (!enabled) return
    let last = ''
    const send = () => {
      const body = JSON.stringify({
        platform: devicePlatform(),
        standalone: isStandalone(),
        push_permission: pushPermission(),
      })
      if (body === last) return
      last = body
      void apiFetch('/api/v1/notifications/device-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {
        last = ''
      })
    }
    send()
    const onVisible = () => {
      if (document.visibilityState === 'visible') send()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, pushSubscribed])
}
