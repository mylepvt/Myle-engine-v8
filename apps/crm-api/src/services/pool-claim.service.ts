import { PipelineKind, type Lead } from "@prisma/client";
import { prisma } from "../db.js";
import type { AuthUser } from "../lib/auth-context.js";
import { fsmError } from "../domain/fsm.js";
import { runPoolClaimBatchInTransaction, runPoolClaimInTransaction } from "./wallet-execution.service.js";
import { bumpRealtimeScoreOnActivity } from "./redis-score.service.js";
import { emitLeadById, emitAdminActivity } from "../realtime/emit.js";
import { userRoom } from "../realtime/rooms.js";
import type { Server } from "socket.io";
import type { EventGateway } from "../realtime/gateway.js";
import { recordAudit } from "./audit.service.js";

export async function claimFromPool(
  user: AuthUser,
  input: { leadId: string; idempotencyKey: string; pipelineKind: "PERSONAL" | "TEAM" },
  io?: Server,
  gateway?: EventGateway,
) {
  if (!["team", "leader", "admin"].includes(user.role)) {
    throw fsmError("FORBIDDEN", "Cannot claim", 403);
  }

  try {
    const result = await prisma.$transaction(async (tx) =>
      runPoolClaimInTransaction(tx, user, input),
    );

    if (result.duplicate) {
      if (result.lead) {
        io?.to(userRoom(user.id)).emit("wallet.claimed", { leadId: result.lead.id, duplicate: true });
        gateway?.publish({
          type: "wallet:debited",
          payload: { leadId: result.lead.id, duplicate: true, userId: user.id },
          priority: "medium",
          idempotencyKey: `wallet:debited:dup:${input.idempotencyKey}`,
        }).catch(() => {});
      }
      await recordAudit({
        source: "api",
        action: "claim.duplicate",
        leadId: input.leadId,
        actorId: user.id,
        idempotencyKey: `audit:claim:dup:${input.idempotencyKey}`,
        meta: { duplicate: true },
      });
      emitAdminActivity(io, gateway, {
        action: "lead:claim_duplicate",
        actorId: user.id,
        targetId: result.lead?.id,
        targetType: "lead",
        description: `Duplicate claim attempt on lead ${result.lead?.id?.slice(0, 8)}`,
        metadata: { leadId: result.lead?.id, idempotencyKey: input.idempotencyKey },
        severity: "warning",
      });
      return result.lead;
    }

    const { lead } = result;
    await recordAudit({
      source: "api",
      action: "claim",
      leadId: lead.id,
      actorId: user.id,
      idempotencyKey: `audit:claim:${input.idempotencyKey}`,
      meta: { priceCents: lead.poolPriceCents, pipelineKind: lead.pipelineKind },
      amountCents: -lead.poolPriceCents,
    });

    await bumpRealtimeScoreOnActivity(user.id, lead.pipelineKind, 1);
    io?.to(userRoom(user.id)).emit("wallet.claimed", { leadId: lead.id, duplicate: false });
    gateway?.publish({
      type: "wallet:debited",
      payload: { leadId: lead.id, duplicate: false, userId: user.id, amountCents: lead.poolPriceCents },
      priority: "medium",
      idempotencyKey: `wallet:debited:${input.idempotencyKey}`,
    }).catch(() => {});
    await emitLeadById(prisma, io, gateway, lead.id, { leadId: lead.id, claimed: true }, true);
    emitAdminActivity(io, gateway, {
      action: "lead:claimed",
      actorId: user.id,
      targetId: lead.id,
      targetType: "lead",
      description: `Lead claimed from pool (₹${(lead.poolPriceCents / 100).toFixed(2)})`,
      metadata: { priceCents: lead.poolPriceCents, pipelineKind: lead.pipelineKind },
      severity: "info",
    });
    return lead;
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
      if (lead) return lead;
    }
    throw e;
  }
}

export type ClaimBatchResult = { leads: Lead[]; totalPriceCents: number };

export async function claimBatchFromPool(
  user: AuthUser,
  input: { count: number; idempotencyKey: string; pipelineKind: "PERSONAL" | "TEAM" },
  io?: Server,
  gateway?: EventGateway,
): Promise<ClaimBatchResult> {
  if (!["team", "leader", "admin"].includes(user.role)) {
    throw fsmError("FORBIDDEN", "Cannot claim", 403);
  }

  const { leads } = await prisma.$transaction((tx) => runPoolClaimBatchInTransaction(tx, user, input));

  const totalPriceCents = leads.reduce((s, l) => s + l.poolPriceCents, 0);
  const pipelineKind = (leads[0]?.pipelineKind ?? input.pipelineKind) as PipelineKind;

  await recordAudit({
    source: "api",
    action: "claim.batch",
    actorId: user.id,
    idempotencyKey: `audit:claim:batch:${input.idempotencyKey}`,
    meta: {
      count: leads.length,
      leadIds: leads.map((l) => l.id),
      pipelineKind,
    },
    amountCents: -totalPriceCents,
  });

  await bumpRealtimeScoreOnActivity(user.id, pipelineKind, leads.length);

  for (const lead of leads) {
    io?.to(userRoom(user.id)).emit("wallet.claimed", { leadId: lead.id, duplicate: false });
    gateway?.publish({
      type: "wallet:debited",
      payload: { leadId: lead.id, duplicate: false, userId: user.id, amountCents: lead.poolPriceCents },
      priority: "low",
      idempotencyKey: `wallet:debited:${lead.id}:${input.idempotencyKey}`,
    }).catch(() => {});
    await emitLeadById(prisma, io, gateway, lead.id, { leadId: lead.id, claimed: true }, true);
  }

  emitAdminActivity(io, gateway, {
    action: "lead:batch_claimed",
    actorId: user.id,
    targetType: "lead",
    description: `Batch claimed ${leads.length} leads (₹${(totalPriceCents / 100).toFixed(2)})`,
    metadata: { count: leads.length, totalPriceCents, leadIds: leads.map((l) => l.id) },
    severity: "info",
  });

  return { leads, totalPriceCents };
}
