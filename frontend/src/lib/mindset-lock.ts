import type { MindsetLockPreviewResponse } from '@/hooks/use-leads-query'

type MindsetLockSendStateArgs = {
  mindsetReady: boolean
  remainingSeconds: number
  preview?: Pick<MindsetLockPreviewResponse, 'leader_name'> | null
}

export function getMindsetLockSendState({
  mindsetReady,
  remainingSeconds,
  preview,
}: MindsetLockSendStateArgs) {
  const unlocked = Math.max(0, remainingSeconds) === 0
  const leaderName =
    typeof preview?.leader_name === 'string' && preview.leader_name.trim()
      ? preview.leader_name.trim()
      : 'Leader will be assigned on send'

  return {
    unlocked,
    canSend: mindsetReady && unlocked,
    leaderName,
  }
}
