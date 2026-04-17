import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class DashboardOutletErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard route error:', error, info.componentStack)
  }

  private isChunkLoadLikeError(msg: string): boolean {
    const m = msg.toLowerCase()
    return (
      m.includes('mime type') ||
      m.includes('failed to fetch dynamically imported module') ||
      m.includes('importing a module script failed') ||
      m.includes('loading chunk') ||
      m.includes('chunkloaderror')
    )
  }

  private async recoverAndReload() {
    // Fix for installed PWA/users after deploy where old shell requests removed chunks.
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
      }
    } finally {
      const url = new URL(window.location.href)
      url.searchParams.set('r', String(Date.now()))
      window.location.replace(url.toString())
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || 'Unexpected error'
      const chunkLike = this.isChunkLoadLikeError(msg)
      return (
        <div
          className="max-w-lg space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">This view crashed</p>
          <p className="text-muted-foreground">
            {msg}
          </p>
          {chunkLike ? (
            <p className="text-xs text-muted-foreground/90">
              App update mismatch detected. Repair will clear stale app cache and reload.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (chunkLike) {
                void this.recoverAndReload()
              } else {
                this.setState({ error: null })
              }
            }}
          >
            {chunkLike ? 'Repair & Reload' : 'Try again'}
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
