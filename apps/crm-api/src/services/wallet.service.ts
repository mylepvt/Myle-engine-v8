import type { Prisma } from "@prisma/client";
import { LedgerDirection } from "@prisma/client";
import { prisma } from "../db.js";

export async function walletBalanceCents(
  userId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const rows = await tx.walletLedger.findMany({
    where: { userId },
    select: { direction: true, amountCents: true },
  });
  let bal = 0;
  for (const r of rows) {
    bal += r.direction === LedgerDirection.CREDIT ? r.amountCents : -r.amountCents;
  }
  return bal;
}
