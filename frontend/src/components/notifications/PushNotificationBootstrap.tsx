import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { syncPushSubscriptionSilently } from '@/hooks/use-push-notifications'

export function PushNotificationBootstrap() {
  const { data: authData } = useAuthMeQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authData?.authenticated) return
    void syncPushSubscriptionSilently().catch(() => undefined)
  }, [authData?.authenticated, authData?.user_id])

  // Notification tapped while the app is open: the service worker asks us to
  // route in-app (no reload, history kept, so Back returns to the prior page).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null
      if (data?.type !== 'NAVIGATE' || typeof data.url !== 'string') return
      try {
        const target = new URL(data.url, window.location.origin)
        if (target.origin !== window.location.origin) return
        navigate(`${target.pathname}${target.search}${target.hash}`)
      } catch {
        /* malformed url — ignore */
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return null
}
