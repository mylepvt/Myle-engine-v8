import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { claimFromPool } from "../services/pool-claim.service.js";

const claimBody = z.object({
  leadId: z.string(),
  idempotencyKey: z.string().min(8),
  pipelineKind: z.nativeEnum(PipelineKind),
});

export async function poolRoutes(fastify: FastifyInstance) {
  fastify.get("/pool/leads", async (req) => {
    requireAuth(req);
    const q = z.object({ pipelineKind: z.nativeEnum(PipelineKind) }).parse(req.query);
    return prisma.lead.findMany({
      where: { inPool: true, pipelineKind: q.pipelineKind },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  });

  fastify.post("/pool/claim", async (req) => {
    const user = requireAuth(req);
    const body = claimBody.parse(req.body);
    return claimFromPool(
      user,
      {
        leadId: body.leadId,
        idempotencyKey: body.idempotencyKey,
        pipelineKind: body.pipelineKind,
      },
      fastify.io,
    );
  });
}
