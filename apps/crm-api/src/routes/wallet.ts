import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { walletBalanceCents } from "../services/wallet.service.js";
import { runWalletCreditInTransaction } from "../services/wallet-execution.service.js";
import { recordAudit } from "../services/audit.service.js";

const creditBody = z.object({
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  note: z.string().optional(),
});

export async function walletRoutes(fastify: FastifyInstance) {
  fastify.get("/wallet/balance", async (req) => {
    const user = requireAuth(req);
    const bal = await walletBalanceCents(user.id);
    return { userId: user.id, balanceCents: bal, currency: "INR" as const };
  });

  /** Dev / admin credit — gated by CRM_INTERNAL_SECRET; idempotent via WalletLedger + audit */
  fastify.post("/wallet/credit", async (req, reply) => {
    const secret = req.headers["x-internal-secret"];
    if (!process.env.CRM_INTERNAL_SECRET || secret !== process.env.CRM_INTERNAL_SECRET) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const user = requireAuth(req);
    const body = creditBody.parse(req.body);

    const row = await prisma.$transaction(async (tx) => {
      const r = await runWalletCreditInTransaction(tx, {
        userId: user.id,
        amountCents: body.amountCents,
        idempotencyKey: body.idempotencyKey,
        note: body.note ?? "manual_credit",
      });
      return r;
    });

    if (row.created) {
      await recordAudit({
        source: "api",
        action: "wallet.credit",
        actorId: user.id,
        targetUserId: user.id,
        amountCents: body.amountCents,
        idempotencyKey: `audit:wallet:credit:${body.idempotencyKey}`,
        meta: { note: body.note },
      });
      return reply.code(201).send(row.row);
    }
    const existing = await prisma.walletLedger.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
    });
    return reply.send(existing);
  });

  fastify.get("/wallet/ledger", async (req) => {
    const user = requireAuth(req);
    return prisma.walletLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
}
