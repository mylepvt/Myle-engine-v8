import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { claimFromPool } from "../services/pool-claim.service.js";

const claimBody = z.object({
  /** CRM cuid OR numeric FastAPI lead ID (resolved via legacyId). */
  leadId: z.union([z.string(), z.number().int().positive()]),
  idempotencyKey: z.string().min(8),
  pipelineKind: z.nativeEnum(PipelineKind),
});

/** Resolve CRM cuid from either a cuid string or a numeric legacyId. */
async function resolvePoolLeadId(leadId: string | number): Promise<string> {
  if (typeof leadId === "number" || /^\d+$/.test(String(leadId))) {
    const asInt = typeof leadId === "number" ? leadId : parseInt(leadId as string, 10);
    const found = await prisma.lead.findUnique({
      where: { legacyId: asInt },
      select: { id: true },
    });
    if (!found) {
      const err = new Error(`No CRM lead found for legacyId ${asInt}`);
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }
    return found.id;
  }
  return String(leadId);
}

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
    const crmLeadId = await resolvePoolLeadId(body.leadId);
    return claimFromPool(
      user,
      {
        leadId: crmLeadId,
        idempotencyKey: body.idempotencyKey,
        pipelineKind: body.pipelineKind,
      },
      fastify.io,
    );
  });
}
