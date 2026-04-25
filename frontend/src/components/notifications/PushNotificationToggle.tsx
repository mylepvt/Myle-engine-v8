import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/use-push-notifications'

export function PushNotificationToggle() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    errorMessage,
    supportMessage,
    subscribe,
    unsubscribe,
    refresh,
  } =
    usePushNotifications()

  if (!isSupported) {
    return (
      <p className="max-w-xs text-right text-sm text-amber-700">{supportMessage}</p>
    )
  }

  if (permission === 'denied') {
    return (
      <p className="max-w-xs text-right text-sm text-amber-700">
        Notifications are blocked for this device. Turn them back on in browser or app settings.
      </p>
    )
  }

  if (isSubscribed) {
    return (
      <div className="flex flex-col items-end gap-2">
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          This device is connected for alerts
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void unsubscribe()}
          >
            {isLoading ? 'Disabling…' : 'Disable'}
          </Button>
        </div>
        {errorMessage ? <p className="max-w-xs text-right text-xs text-rose-600">{errorMessage}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex max-w-xs flex-col items-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={() => void subscribe()}
      >
        {isLoading ? 'Enabling…' : permission === 'granted' ? 'Reconnect notifications' : 'Enable push notifications'}
      </Button>
      {errorMessage ? (
        <p className="text-right text-xs text-rose-600">{errorMessage}</p>
      ) : (
        <p className="text-right text-xs text-gray-500">
          Allow alerts once on this device and Myle will keep the connection synced automatically.
        </p>
      )}
    </div>
  )
}
