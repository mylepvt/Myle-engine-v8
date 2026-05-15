import { cn } from '@/lib/utils'

type Status = 'online' | 'idle' | 'dnd' | 'offline'

export function StatusDot({ status }: { status: Status }) {
  return <span className={cn('status-dot', status)} />
}
