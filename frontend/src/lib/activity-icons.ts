/**
 * Single icon registry for activity feeds, funnels and onboarding — lucide icons
 * only, so every surface renders the same crisp icon on Android, iOS and desktop
 * (emoji render differently per platform and can't be themed).
 */
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Flag,
  Hand,
  IndianRupee,
  Link2,
  type LucideIcon,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Trophy,
  Upload,
  XCircle,
} from 'lucide-react'

const ACTION_ICONS: Record<string, LucideIcon> = {
  commit_boundary: RefreshCw,
  lead_state: ArrowRight,
  'lead:created': Plus,
  'lead:transitioned': ArrowRight,
  'lead:assigned': ArrowLeftRight,
  'lead:auto_reassigned': AlertCircle,
  'lead:closed': Trophy,
  'lead:claimed': Flag,
  'lead:batch_claimed': Flag,
  'lead:claim_duplicate': AlertTriangle,
  'lead:shadow_created': Upload,
  'lead:shadow_synced': Upload,
  'lead:shadow_deleted': XCircle,
  shadow_delivery: Upload,
  LEAD_UPSERT: Upload,
  LEAD_DELETE: XCircle,
  'wallet:credited': IndianRupee,
  'wallet:credited_worker': IndianRupee,
  'wallet.adjustment': IndianRupee,
  'wallet.recharge_review': IndianRupee,
  'enrollment.link_generated': Link2,
  'performance:recomputed': Star,
  'system:ranking_recalc': TrendingUp,
  'system:scheduler_tick': Timer,
  'fsm:validation_failed': XCircle,
  'scheduler.failure': XCircle,
  'scheduler.watch_archive': Timer,
  'scheduler.leader_enforcement': Flag,
}

/** Icon for an admin activity-feed action (falls back to a generic activity icon). */
export function activityIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] ?? Activity
}

export type LiveActivityKind = 'new' | 'claim' | 'conversion' | 'money' | 'handoff' | 'stage'

export const LIVE_ACTIVITY_ICONS: Record<LiveActivityKind, LucideIcon> = {
  new: Sparkles,
  claim: Hand,
  conversion: Trophy,
  money: IndianRupee,
  handoff: ArrowLeftRight,
  stage: Pin,
}
