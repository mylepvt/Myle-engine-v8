import { LeadStage, PipelineKind } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { AuthUser } from "../lib/auth-context.js";
import type { FsmEvent } from "../domain/fsm.js";
import { fsmError, optimisticVersionMatch, resolveFsmTransition } from "../domain/fsm.js";
import { deleteLeadTrackingInTx, journeyResetUpdateData } from "./full-journey-reset.js";
import { emitLeadDomainEvent, type LeadEmitPayload } from "../realtime/emit.js";
import { userRoom } from "../realtime/rooms.js";
import type { Server } from "socket.io";
import { bumpRealtimeScoreOnActivity } from "./redis-score.service.js";
import { recordAudit } from "./audit.service.js";
import { acquireLock, releaseLock } from "../lib/redis-lock.js";

const INACTIVITY_REASSIGN_MS = 48 * 60 * 60 * 1000;

async function teamScopeForUser(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  return u?.teamId ?? "default";
}

async function emitLeadChange(
  io: Server | undefined,
  lead: {
    id: string;
    pipelineKind: PipelineKind;
    handlerId: string | null;
    ownerId: string;
  },
  payload: Record<string, unknown>,
  systemAlert?: boolean,
) {
  const scopeUserId = lead.handlerId ?? lead.ownerId;
  const teamId = await teamScopeForUser(scopeUserId);
  const merged: LeadEmitPayload = { ...payload, leadId: lead.id };
  emitLeadDomainEvent(io, {
    pipelineKind: lead.pipelineKind,
    leadId: lead.id,
    handlerId: lead.handlerId,
    ownerId: lead.ownerId,
    teamId,
    payload: merged,
    systemAlert,
  });
}

export async function createLead(
  user: AuthUser,
  body: { name: string; phone?: string; pipelineKind: PipelineKind; legacyId?: number },
  io?: Server,
) {
  const lead = await prisma.lead.create({
    data: {
      name: body.name.trim(),
      phone: body.phone?.trim(),
      pipelineKind: body.pipelineKind,
      ownerId: user.id,
      inPool: true,
      handlerId: null,
      stage: LeadStage.NEW,
      ...(body.legacyId !== undefined ? { legacyId: body.legacyId } : {}),
    },
  });
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      actorId: user.id,
      action: "lead.created",
      meta: { pipelineKind: body.pipelineKind },
    },
  });
  await emitLeadChange(io, lead, { leadId: lead.id, stage: lead.stage });
  return lead;
}

export async function listLeads(user: AuthUser, pipelineKind?: PipelineKind) {
  const where: Prisma.LeadWhereInput = {};
  if (pipelineKind) where.pipelineKind = pipelineKind;
  if (user.role === "admin") {
    /* all */
  } else if (user.role === "leader") {
    where.OR = [{ ownerId: user.id }, { handlerId: user.id }];
  } else {
    where.OR = [{ handlerId: user.id }, { ownerId: user.id }];
  }
  return prisma.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function transitionLead(
  user: AuthUser,
  leadId: string,
  input: { event: FsmEvent; expectedVersion: number },
  io?: Server,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw fsmError("NOT_FOUND", "Lead not found", 404);
  if (lead.handlerId !== user.id) {
    throw fsmError("FORBIDDEN", "Only the active handler may transition this lead (no manual override)", 403);
  }
  if (!optimisticVersionMatch(lead.stageVersion, input.expectedVersion)) {
    throw fsmError("FSM_VERSION_CONFLICT", "stageVersion mismatch", 409);
  }

  const next = resolveFsmTransition(lead.stage, input.event);

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      stage: next,
      stageVersion: { increment: 1 },
      lastActivityAt: new Date(),
      ...(next === LeadStage.MINDSET_LOCK
        ? { mindsetLockStartedAt: new Date(), mindsetLockBlocked: true }
        : {}),
      ...(input.event === "MINDSET_COMPLETE"
        ? { mindsetLockCompletedAt: new Date(), mindsetLockBlocked: false }
        : {}),
    },
  });
  await prisma.leadActivity.create({
    data: {
      leadId,
      actorId: user.id,
      action: `fsm.${input.event}`,
      meta: { from: lead.stage, to: next },
    },
  });
  await bumpRealtimeScoreOnActivity(user.id, lead.pipelineKind, 0.35);
  await emitLeadChange(io, updated, { leadId, stage: updated.stage });
  await recordAudit({
    source: "api",
    action: "fsm.transition",
    leadId,
    actorId: user.id,
    idempotencyKey: `audit:fsm:${leadId}:${lead.stageVersion}:${input.event}`,
    meta: { from: lead.stage, to: next, event: input.event },
  });
  return updated;
}

async function reassignWithFullJourneyReset(
  tx: Prisma.TransactionClient,
  leadId: string,
  fromHandlerId: string,
  toUserId: string,
  reason: string,
  actorId: string | null,
  system: boolean,
) {
  await deleteLeadTrackingInTx(tx, leadId);
  const u = await tx.lead.update({
    where: { id: leadId },
    data: journeyResetUpdateData(toUserId, { autoReassign: system }),
  });
  await tx.leadAssignment.create({
    data: {
      leadId,
      fromHandlerId: fromHandlerId,
      toHandlerId: toUserId,
      kind: "reassign",
      reason,
    },
  });
  await tx.leadActivity.create({
    data: {
      leadId,
      actorId,
      action: "lead.reassigned",
      meta: { from: fromHandlerId, to: toUserId, system },
    },
  });
  return u;
}

export async function reassignLead(
  actor: AuthUser,
  leadId: string,
  toUserId: string,
  reason: string | undefined,
  io?: Server,
) {
  if (!["admin", "leader"].includes(actor.role)) {
    throw fsmError("FORBIDDEN", "Reassign not allowed", 403);
  }
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw fsmError("NOT_FOUND", "Lead not found", 404);
  if (lead.inPool) throw fsmError("INVALID_STATE", "Lead still in pool", 400);
  if (!lead.handlerId) throw fsmError("INVALID_STATE", "Lead has no handler", 400);

  const prev = lead.handlerId;
  const ownerBefore = lead.ownerId;
  const lockOk = await acquireLock(`lead:${leadId}:reassign`, 60);
  if (!lockOk) {
    throw fsmError("REASSIGN_LOCK", "Lead reassignment in progress — retry shortly", 409);
  }
  try {
    const updated = await prisma.$transaction((tx) =>
      reassignWithFullJourneyReset(tx, leadId, prev!, toUserId, reason ?? "manual", actor.id, false),
    );
    if (updated.ownerId !== ownerBefore) {
      throw new Error("Invariant: owner_id must not change on reassign");
    }

    io?.to(userRoom(toUserId)).emit("lead.assigned", { leadId, handlerId: toUserId });
    await emitLeadChange(io, updated, { leadId, stage: updated.stage, reassign: true }, true);
    await recordAudit({
      source: "api",
      action: "reassign",
      leadId,
      actorId: actor.id,
      targetUserId: toUserId,
      idempotencyKey: `audit:reassign:${leadId}:${updated.stageVersion}`,
      meta: { from: prev, to: toUserId, reason: reason ?? "manual" },
    });
    return updated;
  } finally {
    await releaseLock(`lead:${leadId}:reassign`);
  }
}

export async function systemReassignStaleLeadCore(
  leadId: string,
  toUserId: string,
  io: Server | undefined,
  opts: { minIdleMs: number },
) {
  const lockOk = await acquireLock(`lead:${leadId}:reassign`, 60);
  if (!lockOk) return null;

  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.inPool || !lead.handlerId || !lead.lastActivityAt) return null;
    const idle = Date.now() - lead.lastActivityAt.getTime();
    if (idle < opts.minIdleMs) return null;

    const prev = lead.handlerId;
    const ownerBefore = lead.ownerId;
    const updated = await prisma.$transaction((tx) =>
      reassignWithFullJourneyReset(tx, leadId, prev, toUserId, "auto_alive", null, true),
    );
    if (updated.ownerId !== ownerBefore) {
      throw new Error("Invariant: owner_id must not change on auto reassign");
    }

    io?.to(userRoom(toUserId)).emit("lead.assigned", { leadId, handlerId: toUserId });
    await emitLeadChange(io, updated, { leadId, stage: updated.stage, reassign: true }, true);
    await recordAudit({
      source: "worker",
      action: "escalation.reassign",
      leadId,
      targetUserId: toUserId,
      idempotencyKey: `audit:esc:reassign:${leadId}:${updated.stageVersion}`,
      meta: { from: prev, to: toUserId, escalationLevel: "REASSIGNED" },
    });
    return updated;
  } finally {
    await releaseLock(`lead:${leadId}:reassign`);
  }
}

export async function systemReassignStaleLead(leadId: string, toUserId: string, io?: Server) {
  return systemReassignStaleLeadCore(leadId, toUserId, io, { minIdleMs: INACTIVITY_REASSIGN_MS });
}

export async function closeLead(user: AuthUser, leadId: string, io?: Server) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw fsmError("NOT_FOUND", "Lead not found", 404);
  if (lead.handlerId !== user.id && user.role !== "admin") {
    throw fsmError("FORBIDDEN", "Only handler or admin may close", 403);
  }
  resolveFsmTransition(lead.stage, "CLOSE_WON");

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      stage: LeadStage.CLOSED,
      stageVersion: { increment: 1 },
      closedAt: new Date(),
      closedById: user.id,
      lastActivityAt: new Date(),
    },
  });
  await prisma.leadActivity.create({
    data: {
      leadId,
      actorId: user.id,
      action: "lead.closed",
      meta: { closedBy: user.id },
    },
  });
  await bumpRealtimeScoreOnActivity(user.id, lead.pipelineKind, 2);
  await emitLeadChange(io, updated, { leadId, closed: true });
  await recordAudit({
    source: "api",
    action: "close",
    leadId,
    actorId: user.id,
    idempotencyKey: `audit:close:${leadId}:${lead.stageVersion}`,
    meta: { stageBefore: lead.stage },
  });
  return updated;
}
