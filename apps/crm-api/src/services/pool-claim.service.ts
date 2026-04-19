import { PipelineKind, type Lead } from "@prisma/client";
import { prisma } from "../db.js";
import type { AuthUser } from "../lib/auth-context.js";
import { fsmError } from "../domain/fsm.js";
import { runPoolClaimBatchInTransaction, runPoolClaimInTransaction } from "./wallet-execution.service.js";
import { bumpRealtimeScoreOnActivity } from "./redis-score.service.js";
import { emitLeadById } from "../realtime/emit.js";
import { userRoom } from "../realtime/rooms.js";
import type { Server } from "socket.io";
import { recordAudit } from "./audit.service.js";

export async function claimFromPool(
  user: AuthUser,
  input: { leadId: string; idempotencyKey: string; pipelineKind: "PERSONAL" | "TEAM" },
  io?: Server,
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
      }
      await recordAudit({
        source: "api",
        action: "claim.duplicate",
        leadId: input.leadId,
        actorId: user.id,
        idempotencyKey: `audit:claim:dup:${input.idempotencyKey}`,
        meta: { duplicate: true },
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
    await emitLeadById(prisma, io, lead.id, { leadId: lead.id, claimed: true }, true);
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
    await emitLeadById(prisma, io, lead.id, { leadId: lead.id, claimed: true }, true);
  }

  return { leads, totalPriceCents };
}
