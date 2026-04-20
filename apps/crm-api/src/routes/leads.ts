import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LeadStage, PipelineKind } from "@prisma/client";
import { requireAuth } from "../lib/auth-context.js";
import {
  deleteLeadLegacyShadow,
  deriveShadowStageFromLegacy,
  syncLeadLegacyShadow,
} from "../services/lead-legacy-shadow.service.js";

const legacyShadowBody = z.object({
  legacyId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  pipelineKind: z.nativeEnum(PipelineKind).optional(),
  legacyStatus: z.string().min(1),
  version: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  stage: z.nativeEnum(LeadStage).optional(),
  whatsappSentAt: z.string().datetime().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  mindsetLockState: z.string().nullable().optional(),
  mindsetStartedAt: z.string().datetime().nullable().optional(),
  mindsetCompletedAt: z.string().datetime().nullable().optional(),
  day1CompletedAt: z.string().datetime().nullable().optional(),
  day2CompletedAt: z.string().datetime().nullable().optional(),
  day3CompletedAt: z.string().datetime().nullable().optional(),
  deleted: z.boolean().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
  permanentlyDeleted: z.boolean().optional(),
});

export async function leadRoutes(fastify: FastifyInstance) {
  fastify.post("/leads/:leadId/legacy-shadow", async (req, reply) => {
    const secret = req.headers["x-internal-secret"];
    if (!process.env.CRM_INTERNAL_SECRET || secret !== process.env.CRM_INTERNAL_SECRET) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const body = legacyShadowBody.parse(req.body);
    const stage = body.stage ?? deriveShadowStageFromLegacy(body);
    const row = await syncLeadLegacyShadow({ ...body, stage });
    return reply.code(200).send(row);
  });

  fastify.delete("/leads/:leadId/legacy-shadow", async (req, reply) => {
    const secret = req.headers["x-internal-secret"];
    if (!process.env.CRM_INTERNAL_SECRET || secret !== process.env.CRM_INTERNAL_SECRET) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { leadId } = z.object({ leadId: z.coerce.number().int().positive() }).parse(req.params);
    const row = await deleteLeadLegacyShadow(leadId);
    if (!row) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.code(204).send();
  });

  fastify.post("/leads", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Lead creation moved to FastAPI /api/v1/leads" });
  });

  fastify.get("/leads", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Lead reads are no longer served from CRM" });
  });

  fastify.post("/leads/:leadId/transition", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Lead lifecycle moved to FastAPI /api/v1/leads/{id}/transition" });
  });

  fastify.post("/leads/:leadId/reassign", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Lead reassignment moved to FastAPI" });
  });

  fastify.post("/leads/:leadId/close", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Lead closing moved to FastAPI" });
  });
}
