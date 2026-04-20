import { createHash } from "node:crypto";

import { LedgerDirection } from "@prisma/client";
import type { Lead, Prisma } from "@prisma/client";
import type { AuthUser } from "../lib/auth-context.js";
import { fsmError } from "../domain/fsm.js";
import { walletBalanceCents } from "./wallet.service.js";

/** Stable per-lead idempotency inside a batch (64-char hex, unique constraint safe). */
export function poolClaimLineIdempotencyKey(batchBaseKey: string, crmLeadId: string): string {
  return createHash("sha256").update(`${batchBaseKey}::${crmLeadId}`).digest("hex");
}

export type PoolClaimTxResult =
  | { duplicate: true; lead: Awaited<ReturnType<Prisma.TransactionClient["lead"]["findUnique"]>> }
  | { duplicate: false; lead: NonNullable<Awaited<ReturnType<Prisma.TransactionClient["lead"]["findFirst"]>>> };

/**
 * Idempotent pool claim inside an existing Prisma transaction (single round-trip from API/worker).
 */
export async function runPoolClaimInTransaction(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  input: { leadId: string; idempotencyKey: string; pipelineKind: "PERSONAL" | "TEAM" },
): Promise<PoolClaimTxResult> {
  const existing = await tx.walletLedger.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing?.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: existing.leadId } });
    return { duplicate: true, lead };
  }

  const lead = await tx.lead.findFirst({
    where: {
      id: input.leadId,
      inPool: true,
      pipelineKind: input.pipelineKind,
      isShadow: false,
    },
  });
  if (!lead) throw fsmError("POOL_EMPTY", "Lead not in pool", 400);

  const price = lead.poolPriceCents;
  const bal = await walletBalanceCents(user.id, tx);
  if (bal < price) throw fsmError("INSUFFICIENT_BALANCE", "Insufficient wallet balance", 402);

  await tx.walletLedger.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      direction: LedgerDirection.DEBIT,
      amountCents: price,
      idempotencyKey: input.idempotencyKey,
      note: "pool_claim",
    },
  });

  const updated = await tx.lead.update({
    where: { id: lead.id },
    data: {
      inPool: false,
      ownerId: user.id,
      handlerId: user.id,
      lastActivityAt: new Date(),
    },
  });

  await tx.leadAssignment.create({
    data: {
      leadId: lead.id,
      fromHandlerId: null,
      toHandlerId: user.id,
      kind: "pool_claim",
      reason: "lead pool purchase",
    },
  });

  await tx.leadActivity.create({
    data: {
      leadId: lead.id,
      actorId: user.id,
      action: "lead.claimed",
      meta: { priceCents: price },
    },
  });

  return { duplicate: false, lead: updated };
}

export type PoolClaimBatchTxResult = { leads: Lead[] };

/**
 * Claim up to ``count`` (1–50) pool leads in FIFO order inside one transaction.
 * Fails the whole batch if the wallet cannot cover the **sum** of selected rows (legacy parity).
 */
export async function runPoolClaimBatchInTransaction(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  input: { count: number; idempotencyKey: string; pipelineKind: "PERSONAL" | "TEAM" },
): Promise<PoolClaimBatchTxResult> {
  const cap = Math.max(1, Math.min(50, Math.floor(input.count)));
  const picked = await tx.lead.findMany({
    where: { inPool: true, pipelineKind: input.pipelineKind, isShadow: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: cap,
  });
  if (picked.length === 0) {
    throw fsmError("POOL_EMPTY", "No leads available in pool", 400);
  }

  const total = picked.reduce((acc, l) => acc + l.poolPriceCents, 0);
  const bal = await walletBalanceCents(user.id, tx);
  if (bal < total) {
    throw fsmError("INSUFFICIENT_BALANCE", "Insufficient wallet balance for this batch", 402);
  }

  const leadsOut: PoolClaimBatchTxResult["leads"] = [];
  for (const row of picked) {
    const lineIdem = poolClaimLineIdempotencyKey(input.idempotencyKey, row.id);
    const r = await runPoolClaimInTransaction(tx, user, {
      leadId: row.id,
      idempotencyKey: lineIdem,
      pipelineKind: input.pipelineKind,
    });
    if (r.duplicate) {
      throw fsmError("POOL_CONFLICT", "A lead in this batch was already claimed; retry", 409);
    }
    leadsOut.push(r.lead);
  }
  return { leads: leadsOut };
}

export type WalletCreditInput = {
  userId: string;
  amountCents: number;
  idempotencyKey: string;
  note?: string;
};

/** Idempotent credit — used by wallet worker and can be called from API transaction. */
export async function runWalletCreditInTransaction(
  tx: Prisma.TransactionClient,
  input: WalletCreditInput,
): Promise<{ created: boolean; row: { id: string } }> {
  const existing = await tx.walletLedger.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { created: false, row: existing };

  const row = await tx.walletLedger.create({
    data: {
      userId: input.userId,
      direction: LedgerDirection.CREDIT,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      note: input.note ?? "credit",
    },
  });
  return { created: true, row };
}
