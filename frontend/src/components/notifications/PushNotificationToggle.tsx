import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/use-push-notifications'

export function PushNotificationToggle() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications()

  if (!isSupported) {
    return (
      <p className="text-sm text-gray-500">Push notifications not supported on this browser</p>
    )
  }

  if (permission === 'denied') {
    return (
      <p className="text-sm text-amber-600">Notifications blocked in browser settings</p>
    )
  }

  if (isSubscribed) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Notifications enabled
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={() => void unsubscribe()}
        >
          {isLoading ? 'Disabling…' : 'Disable'}
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isLoading}
      onClick={() => void subscribe()}
    >
      {isLoading ? 'Enabling…' : 'Enable push notifications'}
    </Button>
  )
}
