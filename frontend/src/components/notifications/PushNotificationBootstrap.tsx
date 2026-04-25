import { useEffect } from 'react'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { syncPushSubscriptionSilently } from '@/hooks/use-push-notifications'

export function PushNotificationBootstrap() {
  const { data: authData } = useAuthMeQuery()

  useEffect(() => {
    if (!authData?.authenticated) return
    void syncPushSubscriptionSilently().catch(() => undefined)
  }, [authData?.authenticated, authData?.user_id])

  return null
}
