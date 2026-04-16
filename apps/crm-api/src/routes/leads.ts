import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
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
  name: z.string().min(1),
  phone: z.string().optional(),
  pipelineKind: z.nativeEnum(PipelineKind),
});

const transitionBody = z.object({
  event: z.enum(FSM_EVENT_VALUES),
  expectedVersion: z.number().int().nonnegative(),
});

const reassignBody = z.object({
  toUserId: z.string().min(1),
  reason: z.string().optional(),
});

export async function leadRoutes(fastify: FastifyInstance) {
  fastify.post("/leads", async (req, reply) => {
    const user = requireAuth(req);
    const body = createBody.parse(req.body);
    const lead = await createLead(user, body, fastify.io);
    return reply.code(201).send(lead);
  });

  fastify.get("/leads", async (req) => {
    const user = requireAuth(req);
    const q = z.object({ pipelineKind: z.nativeEnum(PipelineKind).optional() }).parse(req.query);
    return listLeads(user, q.pipelineKind);
  });

  fastify.post("/leads/:leadId/transition", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    const body = transitionBody.parse(req.body);
    return transitionLead(user, leadId, { event: body.event as FsmEvent, expectedVersion: body.expectedVersion }, fastify.io);
  });

  fastify.post("/leads/:leadId/reassign", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    const body = reassignBody.parse(req.body);
    return reassignLead(user, leadId, body.toUserId, body.reason, fastify.io);
  });

  fastify.post("/leads/:leadId/close", async (req) => {
    const user = requireAuth(req);
    const { leadId } = z.object({ leadId: z.string() }).parse(req.params);
    return closeLead(user, leadId, fastify.io);
  });
}
