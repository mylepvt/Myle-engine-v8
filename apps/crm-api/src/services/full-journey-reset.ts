import type { Prisma } from "@prisma/client";
import { LeadStage } from "@prisma/client";
import { LeadEscalationLevel } from "../domain/lead-escalation.js";

const REASSIGN_RESET_STAGE = (process.env.CRM_REASSIGN_RESET_STAGE as LeadStage | undefined) ?? LeadStage.INVITED;

export async function deleteLeadTrackingInTx(tx: Prisma.TransactionClient, leadId: string) {
  await tx.callSession.deleteMany({ where: { leadId } });
  await tx.whatsappEvent.deleteMany({ where: { leadId } });
  await tx.videoSession.deleteMany({ where: { leadId } });
}

/** Data fragment for Prisma `lead.update` on full journey reset (reassign). */
export function journeyResetUpdateData(
  handlerId: string,
  opts?: { autoReassign?: boolean },
) {
  return {
    handlerId,
    stage: REASSIGN_RESET_STAGE,
    stageVersion: { increment: 1 } as const,
    lastActivityAt: new Date(),
    leadScore: 0,
    highIntent: false,
    videoWatchPct: null,
    mindsetLockStartedAt: null,
    mindsetLockCompletedAt: null,
    mindsetLockBlocked: false,
    escalationLevel: opts?.autoReassign ? LeadEscalationLevel.REASSIGNED : LeadEscalationLevel.NONE,
    aliveWarnedAt: null,
    aliveLeaderNotifiedAt: null,
    aliveAdminEscalatedAt: null,
    reassignedCount: { increment: 1 } as const,
  };
}

export { REASSIGN_RESET_STAGE };
