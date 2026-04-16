import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EscalationLevel, EscalationState } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { fsmError } from "../domain/fsm.js";
import { teamMayAcknowledgeEscalation } from "../domain/escalation-policy.js";
import { pipelineRoom } from "../realtime/rooms.js";

export async function escalationRoutes(fastify: FastifyInstance) {
  fastify.get("/escalations", async (req) => {
    const user = requireAuth(req);
    const open = await prisma.escalation.findMany({
      where: {
        state: { in: [EscalationState.OPEN, EscalationState.SNOOZED] },
        OR: [{ assigneeId: user.id }, { assigneeId: null }],
      },
      include: { lead: true, events: { orderBy: { createdAt: "desc" }, take: 5 } },
      take: 50,
    });
    return open;
  });

  fastify.post("/escalations", async (req, reply) => {
    const user = requireAuth(req);
    if (!["admin", "leader"].includes(user.role)) throw fsmError("FORBIDDEN", "Cannot create escalation", 403);
    const body = z
      .object({
        leadId: z.string(),
        level: z.nativeEnum(EscalationLevel),
        assigneeId: z.string().optional(),
        dueAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const esc = await prisma.escalation.create({
      data: {
        leadId: body.leadId,
        level: body.level,
        state: EscalationState.OPEN,
        assigneeId: body.assigneeId,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
    });
    await prisma.escalationEvent.create({
      data: {
        escalationId: esc.id,
        kind: "created",
        actorId: user.id,
      },
    });
    const leadRow = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (leadRow) {
      fastify.io
        .to(pipelineRoom(leadRow.pipelineKind))
        .emit("escalation.new", { id: esc.id, leadId: body.leadId });
    }
    if (body.assigneeId) {
      fastify.io.to(`user:${body.assigneeId}`).emit("escalation.new", { id: esc.id, leadId: body.leadId });
    }
    return reply.code(201).send(esc);
  });

  fastify.post("/escalations/:id/ack", async (req) => {
    const user = requireAuth(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const existing = await prisma.escalation.findUnique({ where: { id } });
    if (!existing) throw fsmError("NOT_FOUND", "Escalation not found", 404);
    if (!teamMayAcknowledgeEscalation(user.role, existing)) {
      throw fsmError(
        "ESCALATION_NOT_ACK_BY_TEAM",
        "Alive engine escalations require leader or admin acknowledgement",
        403,
      );
    }
    const esc = await prisma.escalation.update({
      where: { id },
      data: { state: EscalationState.ACKNOWLEDGED },
    });
    await prisma.escalationEvent.create({
      data: { escalationId: id, kind: "ack", actorId: user.id },
    });
    return esc;
  });
}
