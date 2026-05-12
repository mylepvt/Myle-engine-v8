import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { useToastStore } from '@/stores/toast-store'

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
} as const

const colorMap = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  error: 'border-red-500/40 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
} as const

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type]
        return (
          <div
            key={toast.id}
            role="alert"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm ${colorMap[toast.type]} min-w-[280px] max-w-[400px] animate-in slide-in-from-right`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-ds-body text-foreground">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
