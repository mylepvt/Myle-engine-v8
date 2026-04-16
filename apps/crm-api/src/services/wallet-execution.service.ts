import { LedgerDirection } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../lib/auth-context.js";
import { fsmError } from "../domain/fsm.js";
import { walletBalanceCents } from "./wallet.service.js";

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
