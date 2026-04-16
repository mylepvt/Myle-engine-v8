import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import {
  closeLead,
  createLead,
  listLeads,
  reassignLead,
  transitionLead,
} from "../services/lead-execution.service.js";
import { FSM_EVENT_VALUES, type FsmEvent } from "../domain/fsm.js";

const createBody = z.object({
  name: z.string().min(1).optional().default(""),
  phone: z.string().optional(),
  pipelineKind: z.nativeEnum(PipelineKind).optional().default(PipelineKind.PERSONAL),
  /** Optional FastAPI lead ID — set when creating a CRM shadow record for an existing FastAPI lead. */
  legacyId: z.number().int().positive().optional(),
});

const transitionBody = z.object({
  event: z.enum(FSM_EVENT_VALUES),
  expectedVersion: z.number().int().nonnegative(),
});

const reassignBody = z.object({
  toUserId: z.string().min(1),
  reason: z.string().optional(),
});

/** Resolve CRM lead.id from either a cuid string OR a numeric legacyId string. */
async function resolveCrmLeadId(leadIdParam: string): Promise<string> {
  const asInt = parseInt(leadIdParam, 10);
  if (!isNaN(asInt) && String(asInt) === leadIdParam) {
    // Numeric → look up by legacyId
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
  // Already a cuid
  return leadIdParam;
}

export async function leadRoutes(fastify: FastifyInstance) {
  fastify.post("/leads", async (req, reply) => {
    const user = requireAuth(req);
    const body = createBody.parse(req.body);
    const lead = await createLead(user, body, fastify.io);
    return reply.code(201).send(lead);
  });

  fastify.get("/leads", async (req) => {
    const user = requireAuth(req);
    const q = z
      .object({
        pipelineKind: z.nativeEnum(PipelineKind).optional(),
        legacyId: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    if (q.legacyId !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lead = await prisma.lead.findFirst({
        where: { legacyId: q.legacyId } as any,
      });
      return lead ? [lead] : [];
    }
    return listLeads(user, q.pipelineKind);
  });

  fastify.post("/leads/:leadId/transition", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    const body = transitionBody.parse(req.body);
    const crmLeadId = await resolveCrmLeadId(leadId);
    return transitionLead(user, crmLeadId, { event: body.event as FsmEvent, expectedVersion: body.expectedVersion }, fastify.io);
  });

  fastify.post("/leads/:leadId/reassign", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    const body = reassignBody.parse(req.body);
    const crmLeadId = await resolveCrmLeadId(leadId);
    return reassignLead(user, crmLeadId, body.toUserId, body.reason, fastify.io);
  });

  fastify.post("/leads/:leadId/close", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    const crmLeadId = await resolveCrmLeadId(leadId);
    return closeLead(user, crmLeadId, fastify.io);
  });
}
