import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { prisma } from "../../db.js";
import { runWalletCreditInTransaction } from "../../services/wallet-execution.service.js";
import { recordAudit } from "../../services/audit.service.js";
import { emitAdminActivityWorker } from "../../realtime/emit.js";
import { JOB_WALLET_CREDIT, QUEUE_WALLET } from "../names.js";

export type WalletCreditJobData = {
  userId: string;
  amountCents: number;
  idempotencyKey: string;
  note?: string;
  auditMeta?: Record<string, unknown>;
};

export function createWalletWorker(connection: ConnectionOptions) {
  const concurrency = Number(process.env.CRM_WALLET_WORKER_CONCURRENCY ?? 5);

  return new Worker(
    QUEUE_WALLET,
    async (job) => {
      if (job.name !== JOB_WALLET_CREDIT) return { skipped: true };

      const data = job.data as WalletCreditJobData;
      const result = await prisma.$transaction(async (tx) =>
        runWalletCreditInTransaction(tx, {
          userId: data.userId,
          amountCents: data.amountCents,
          idempotencyKey: data.idempotencyKey,
          note: data.note,
        }),
      );

      if (result.created) {
        await recordAudit({
          source: "worker",
          action: "wallet.credit",
          actorId: data.userId,
          targetUserId: data.userId,
          amountCents: data.amountCents,
          idempotencyKey: `audit:worker:credit:${data.idempotencyKey}`,
          meta: data.auditMeta ?? {},
        });
        emitAdminActivityWorker({
          action: "wallet:credited_worker",
          actorId: data.userId,
          targetId: data.userId,
          targetType: "wallet",
          description: `Worker credited ₹${(data.amountCents / 100).toFixed(2)} (${data.note ?? "auto"})`,
          metadata: { amountCents: data.amountCents, note: data.note, idempotencyKey: data.idempotencyKey },
          severity: "info",
        });
      }

      return { created: result.created, ledgerId: result.row.id };
    },
    { connection, concurrency },
  );
}
