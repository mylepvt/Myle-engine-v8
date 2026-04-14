import { Download, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { cn } from '@/lib/utils'

/**
 * Chrome/Edge: `beforeinstallprompt` → Install opens OS / Chrome install sheet.
 * Opens in standalone `display-mode` like an installed app after install.
 */
export function InstallAppBanner() {
  const { showBanner, promptInstall, dismiss, standalone } = usePwaInstall()

  if (standalone || !showBanner) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      role="region"
      aria-label="Install app"
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-primary/30 bg-card/95 p-4 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Download className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-ds-h3 text-foreground">Install Myle</p>
          <p className="mt-1 text-ds-caption leading-relaxed text-muted-foreground">
            Opens full screen from your home screen — same sign-in for leader, team,
            and admin.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => void promptInstall()}
            >
              <Download className="size-4" aria-hidden />
              Install
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          className={cn(
            'shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
