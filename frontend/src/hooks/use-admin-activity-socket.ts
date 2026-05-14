import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAdminFeedStore } from '@/stores/admin-feed-store'

const CRM_SOCKET_URL = import.meta.env.VITE_CRM_SOCKET_URL ?? 'http://127.0.0.1:4000'

const _seenIds = new Set<string>()
const _idQueue: string[] = []
const MAX_DEDUP = 1000

function isDuplicate(id: string): boolean {
  if (_seenIds.has(id)) return true
  _seenIds.add(id)
  _idQueue.push(id)
  if (_idQueue.length > MAX_DEDUP) {
    const oldest = _idQueue.shift()!
    _seenIds.delete(oldest)
  }
  setTimeout(() => {
    _seenIds.delete(id)
    const idx = _idQueue.indexOf(id)
    if (idx >= 0) _idQueue.splice(idx, 1)
  }, 30_000)
  return false
}

export function useAdminActivitySocket(enabled: boolean) {
  const pushEntry = useAdminFeedStore((s) => s.pushEntry)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!enabled) return

    const s = io(CRM_SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: import.meta.env.VITE_CRM_SOCKET_TOKEN ?? '' },
    })
    socketRef.current = s

    s.on('admin:activity', (payload: Record<string, unknown>) => {
      const id = (payload.id as string) ?? `${payload.action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      if (isDuplicate(id)) return

      pushEntry({
        id,
        action: payload.action as string,
        actorId: payload.actorId as string | undefined,
        actorName: payload.actorName as string | undefined,
        targetId: payload.targetId as string | undefined,
        targetType: payload.targetType as string | undefined,
        description: payload.description as string,
        severity: (payload.severity as 'info' | 'warning' | 'error') ?? 'info',
        timestamp: (payload.timestamp as number) ?? Date.now(),
        metadata: payload.metadata as Record<string, unknown> | undefined,
      })
    })

    return () => {
      s.disconnect()
      socketRef.current = null
    }
  }, [enabled, pushEntry])
}
