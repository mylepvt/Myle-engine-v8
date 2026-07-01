import { type ReactNode, useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  ChevronRight,
  Smartphone,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/use-push-notifications'

function BellIcon() {
  return (
    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
      <Bell className="size-8 text-primary" />
    </div>
  )
}

function LoadingPulse() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="size-16 animate-pulse rounded-full bg-border" />
      <div className="h-5 w-44 animate-pulse rounded bg-border" />
      <div className="h-3 w-64 animate-pulse rounded bg-border" />
    </div>
  )
}

export function PushNotificationGate({ children }: { children: ReactNode }) {
  const push = usePushNotifications()
  const [ready, setReady] = useState(false)
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    if (!push.isSupported || push.isSubscribed) {
      setReady(true)
      return
    }
    const timer = setTimeout(() => setReady(true), 1200)
    return () => clearTimeout(timer)
  }, [push.isSupported, push.isSubscribed])

  useEffect(() => {
    if (push.isSubscribed || !push.isSupported) {
      setReady(true)
    }
  }, [push.isSubscribed, push.isSupported])

  if (!push.isSupported) return <>{children}</>
  if (push.isSubscribed) return <>{children}</>
  if (skipped) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background p-4">
      <div className="mx-auto w-full max-w-sm">
        {!ready ? (
          <LoadingPulse />
        ) : push.requiresStandaloneInstall ? (
          <IosGate />
        ) : push.permission === 'denied' ? (
          <DeniedGate />
        ) : (
          <EnableGate onSubscribe={() => void push.subscribe()} isLoading={push.isLoading} />
        )}
      </div>
      {ready ? (
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="mt-5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Skip for now
        </button>
      ) : null}
    </div>
  )
}

function EnableGate({
  onSubscribe,
  isLoading,
}: {
  onSubscribe: () => void
  isLoading: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <BellIcon />
      <h2 className="mb-2 text-xl font-bold text-foreground">Stay notified</h2>
      <p className="mb-8 text-sm text-muted-foreground">
        Get real-time alerts for daily targets, reports, compliance warnings,
        and important updates — right on your phone.
      </p>
      <Button
        onClick={onSubscribe}
        disabled={isLoading}
        className="w-full gap-2"
        size="lg"
      >
        {isLoading ? 'Enabling notifications…' : 'Enable notifications'}
        {!isLoading && <ChevronRight className="size-4" />}
      </Button>
    </div>
  )
}

function IosGate() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Smartphone className="size-8 text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground">Install Myle first</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        On iPhone and iPad, push notifications only work from the installed app.
      </p>
      <ol className="mb-8 space-y-2 text-left text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">1.</span>
          <span>
            Tap the <strong className="text-foreground">Share</strong> button in Safari.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">2.</span>
          <span>
            Scroll down and tap{' '}
            <strong className="text-foreground">Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">3.</span>
          <span>
            Open Myle from your Home Screen and enable notifications.
          </span>
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Reload this page after installing to continue.
      </p>
    </div>
  )
}

function DeniedGate() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <BellOff className="size-8 text-destructive" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground">Notifications blocked</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Notifications are required to use Myle. To receive alerts:
      </p>
      <ul className="mb-8 space-y-2 text-left text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">1.</span>
          <span>
            Open your browser or system settings.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">2.</span>
          <span>
            Find Myle in the site / app permissions list.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">3.</span>
          <span>
            Set <strong className="text-foreground">Notifications</strong> to{' '}
            <strong className="text-foreground">Allow</strong>, then reload.
          </span>
        </li>
      </ul>
      <Button
        onClick={() => window.location.reload()}
        className="w-full"
        size="lg"
      >
        Reload
      </Button>
    </div>
  )
}
