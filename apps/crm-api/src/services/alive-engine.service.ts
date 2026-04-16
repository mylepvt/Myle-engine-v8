import { EscalationLevel, EscalationState, LeadStage, PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { systemReassignStaleLeadCore } from "./lead-execution.service.js";
import { getTopUserIdsByRealtimeScore } from "./redis-score.service.js";
import { pickLeastLoadedHandler } from "./performance.service.js";
import type { Server } from "socket.io";
import { emitToAdmin } from "../realtime/emit.js";
import { userRoom } from "../realtime/rooms.js";
import { recordAudit } from "./audit.service.js";
import { LeadEscalationLevel } from "../domain/lead-escalation.js";

const H36 = 36 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H72 = 72 * 60 * 60 * 1000;

async function pickReassignTarget(
  pipelineKind: PipelineKind,
  teamIds: string[],
): Promise<string | null> {
  const top = await getTopUserIdsByRealtimeScore(pipelineKind, 10);
  const preferred = teamIds.filter((id) => top.includes(id));
  const pool = preferred.length ? preferred : teamIds;
  return pickLeastLoadedHandler(pipelineKind, pool);
}

async function loadAliveCandidates() {
  const leads = await prisma.lead.findMany({
    where: {
      inPool: false,
      handlerId: { not: null },
      lastActivityAt: { not: null },
      stage: { not: LeadStage.CLOSED },
    },
    take: 200,
  });
  const teamUsers = await prisma.user.findMany({
    where: { role: { in: ["team", "leader"] }, active: true },
    select: { id: true },
  });
  return { leads, teamIds: teamUsers.map((u) => u.id) };
}

/**
 * 48h+ idle → auto reassign (Top10 Redis ∩ least-loaded). Sets `escalationLevel` to REASSIGNED via journey reset.
 * No automatic CLOSED — ever.
 */
export async function runAliveReassignTier(io?: Server) {
  const { leads, teamIds } = await loadAliveCandidates();
  let reassigned = 0;

  for (const lead of leads) {
    const last = lead.lastActivityAt!;
    const idle = Date.now() - last.getTime();
    if (idle < H48) continue;

    const pk = lead.pipelineKind as PipelineKind;
    const target = await pickReassignTarget(pk, teamIds);
    if (target && lead.handlerId && target !== lead.handlerId) {
      const r = await systemReassignStaleLeadCore(lead.id, target, io, { minIdleMs: H48 });
      if (r) reassigned += 1;
    }
  }

  return { reassigned };
}

/**
 * 36h → escalation WARNING · 72h → escalation ADMIN + Escalation row + admin notify.
 * (48h reassignment is handled in `runAliveReassignTier`.) No 60h leader tier; system never closes leads.
 */
export async function runAliveCheckStaleTier(io?: Server) {
  const { leads } = await loadAliveCandidates();
  let warned = 0;
  let adminEsc = 0;

  for (const lead of leads) {
    const last = lead.lastActivityAt!;
    const idle = Date.now() - last.getTime();

    if (idle < H36) continue;

    if (idle >= H36 && !lead.aliveWarnedAt) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          aliveWarnedAt: new Date(),
          escalationLevel: LeadEscalationLevel.WARNING,
        },
      });
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: null,
          action: "alive.warning_36h",
          meta: { handlerId: lead.handlerId, escalationLevel: LeadEscalationLevel.WARNING },
        },
      });
      if (lead.handlerId) {
        io?.to(userRoom(lead.handlerId)).emit("alive.warning", { leadId: lead.id, tier: "warn_36h" });
      }
      await recordAudit({
        source: "worker",
        action: "escalation.warning",
        leadId: lead.id,
        idempotencyKey: `audit:esc:warn:${lead.id}`,
        meta: { idleHours: idle / 3600000, escalationLevel: LeadEscalationLevel.WARNING },
      });
      warned += 1;
    }

    if (idle >= H72 && !lead.aliveAdminEscalatedAt) {
      const dup = await prisma.escalation.findFirst({
        where: {
          leadId: lead.id,
          level: EscalationLevel.ADMIN,
          state: { notIn: [EscalationState.RESOLVED] },
        },
      });
      if (!dup) {
        await prisma.escalation.create({
          data: {
            leadId: lead.id,
            level: EscalationLevel.ADMIN,
            state: EscalationState.OPEN,
            assigneeId: null,
            source: "alive_engine",
            mandatoryReview: true,
          },
        });
      }
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          aliveAdminEscalatedAt: new Date(),
          escalationLevel: LeadEscalationLevel.ADMIN,
        },
      });
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: null,
          action: "alive.admin_escalation",
          meta: { idleHours: idle / 3600000, escalationLevel: LeadEscalationLevel.ADMIN },
        },
      });
      emitToAdmin(io, "escalation.new", { leadId: lead.id, tier: "admin_72h" });
      await recordAudit({
        source: "worker",
        action: "escalation.admin",
        leadId: lead.id,
        idempotencyKey: `audit:esc:admin:${lead.id}`,
        meta: { idleHours: idle / 3600000 },
      });
      adminEsc += 1;
    }
  }

  return { warned, leaderAlerts: 0, adminEsc };
}

/**
 * Full alive pass — reassign tier first, then escalation checks. Never modifies CLOSED.
 */
export async function runAliveEnginePass(io?: Server) {
  const r1 = await runAliveReassignTier(io);
  const r2 = await runAliveCheckStaleTier(io);
  return {
    warned: r2.warned,
    reassigned: r1.reassigned,
    leaderAlerts: r2.leaderAlerts,
    adminEsc: r2.adminEsc,
  };
}
