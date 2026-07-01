import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, MoreVertical, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/hooks/use-pwa-install'

function isIosFamily(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent ?? ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isAndroidFamily(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent ?? '')
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

/**
 * Full-screen blocking overlay. When `onActivate` is supplied the whole overlay
 * becomes a tap target, so the user's first tap anywhere fires the native install
 * dialog — Chrome only opens it in response to a user gesture, and this makes that
 * gesture as effortless as possible (closest we can get to an automatic popup).
 */
function GateShell({
  children,
  onActivate,
  onSkip,
}: {
  children: ReactNode
  onActivate?: () => void
  onSkip?: () => void
}) {
  return (
    // The overlay tap is a progressive enhancement so the whole screen triggers
    // install; keyboard and screen-reader users operate the real focusable button
    // rendered inside.
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background p-4"
      onClick={onActivate}
    >
      <div className="mx-auto w-full max-w-sm">{children}</div>
      {onSkip ? (
        <button
          type="button"
          // stopPropagation so skipping never counts as the overlay install tap.
          onClick={(e) => {
            e.stopPropagation()
            onSkip()
          }}
          className="mt-5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Skip for now
        </button>
      ) : null}
    </div>
  )
}

function InstallIcon() {
  return (
    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
      <Download className="size-8 text-primary" />
    </div>
  )
}

/** Native Chrome/Edge/Android install sheet is available — offer the one-tap button. */
function NativeInstallGate({
  onInstall,
}: {
  onInstall: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <InstallIcon />
      <h2 className="mb-2 text-xl font-bold text-foreground">Install Myle to continue</h2>
      <p className="mb-8 text-sm text-muted-foreground">
        Myle must be installed on this device — same sign-in for leader, team, and admin.
      </p>
      <Button onClick={onInstall} className="w-full gap-2" size="lg">
        <Download className="size-4" aria-hidden />
        Install Myle
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">Tap anywhere to install</p>
    </div>
  )
}

/** Android without a native prompt — force manual "Add to Home screen" via the Chrome menu. */
function AndroidManualGate() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Smartphone className="size-8 text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground">Install Myle to continue</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Myle must be installed on your phone before you can use it. It only takes a few
        seconds.
      </p>
      <ol className="mb-8 space-y-2 text-left text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">1.</span>
          <span className="inline-flex flex-wrap items-center gap-1">
            Tap the menu{' '}
            <MoreVertical className="inline size-4 text-foreground" aria-hidden /> in your
            browser&apos;s top-right corner.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">2.</span>
          <span>
            Tap <strong className="text-foreground">Install app</strong> or{' '}
            <strong className="text-foreground">Add to Home screen</strong>.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-semibold text-foreground">3.</span>
          <span>Open Myle from your Home screen to continue.</span>
        </li>
      </ol>
      <Button onClick={() => window.location.reload()} className="w-full" size="lg">
        I&apos;ve installed — Reload
      </Button>
    </div>
  )
}

/** iOS/iPadOS — push + install only work from the Home Screen app. */
function IosManualGate() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Smartphone className="size-8 text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground">Install Myle to continue</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Myle must be installed on your iPhone or iPad before you can use the dashboard.
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
          <span>Open Myle from your Home Screen to continue.</span>
        </li>
      </ol>
      <Button onClick={() => window.location.reload()} className="w-full" size="lg">
        I&apos;ve installed — Reload
      </Button>
    </div>
  )
}

/** Desktop declined the native install prompt — keep them blocked with a retry. */
function DeclinedGate() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
      <InstallIcon />
      <h2 className="mb-2 text-xl font-bold text-foreground">Install required</h2>
      <p className="mb-8 text-sm text-muted-foreground">
        Myle must be installed on this device to continue. Reload the page and choose{' '}
        <strong className="text-foreground">Install</strong> when prompted.
      </p>
      <Button onClick={() => window.location.reload()} className="w-full gap-2" size="lg">
        Reload
      </Button>
    </div>
  )
}

export function InstallAppGate({ children }: { children: ReactNode }) {
  const { standalone, installed, canInstall, promptInstall } = usePwaInstall()
  const [ready, setReady] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const isIos = useMemo(() => isIosFamily(), [])
  const isAndroid = useMemo(() => isAndroidFamily(), [])
  const promptingRef = useRef(false)
  const skip = useCallback(() => setSkipped(true), [])

  // A single guarded entry point: taps on the button AND on the surrounding
  // overlay both route here, but Chrome's native dialog may only be opened once
  // per gesture, so the ref stops a bubbled tap from calling prompt() twice.
  const triggerInstall = useCallback(() => {
    if (promptingRef.current) return
    promptingRef.current = true
    void promptInstall().then((accepted) => {
      promptingRef.current = false
      if (!accepted) setDeclined(true)
    })
  }, [promptInstall])

  useEffect(() => {
    if (standalone || installed) {
      setReady(true)
      return
    }
    const timer = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(timer)
  }, [standalone, installed])

  if (standalone || installed || skipped) return <>{children}</>
  if (!ready) {
    return (
      <GateShell>
        <LoadingPulse />
      </GateShell>
    )
  }

  // A native install sheet is available — the user's first tap anywhere on the
  // overlay opens Chrome's install dialog immediately.
  if (canInstall) {
    return (
      <GateShell onActivate={triggerInstall} onSkip={skip}>
        <NativeInstallGate onInstall={triggerInstall} />
      </GateShell>
    )
  }

  // No native prompt: mobile users are forced through manual install instructions.
  if (isIos) {
    return (
      <GateShell onSkip={skip}>
        <IosManualGate />
      </GateShell>
    )
  }
  if (isAndroid) {
    return (
      <GateShell onSkip={skip}>
        <AndroidManualGate />
      </GateShell>
    )
  }

  // Desktop that declined the prompt stays blocked; otherwise (no install support
  // at all) fall through so nobody is permanently locked out of the web app.
  if (declined) {
    return (
      <GateShell onSkip={skip}>
        <DeclinedGate />
      </GateShell>
    )
  }

  return <>{children}</>
}
