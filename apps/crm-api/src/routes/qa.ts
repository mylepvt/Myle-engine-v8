import type { FastifyInstance } from "fastify";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";

/** Dev/QA only — set `CRM_QA_LAB=true` on crm-api. Used by crm-web `/qa` to discover seeded users & leads. */
export async function qaRoutes(fastify: FastifyInstance) {
  fastify.get("/qa/bootstrap", async (_req, reply) => {
    if (process.env.CRM_QA_LAB !== "true") {
      return reply.code(404).send({ error: "CRM_QA_LAB disabled" });
    }
    const users = await prisma.user.findMany({
      where: { email: { startsWith: "qa-" } },
      select: { id: true, email: true, role: true, name: true },
      orderBy: { email: "asc" },
    });
    const leads = await prisma.lead.findMany({
      where: { name: { startsWith: "QA " }, isShadow: false },
      select: {
        id: true,
        name: true,
        stage: true,
        inPool: true,
        handlerId: true,
        ownerId: true,
        lastActivityAt: true,
        pipelineKind: true,
        stageVersion: true,
        escalationLevel: true,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const handlerLoad = await prisma.lead.groupBy({
      by: ["handlerId"],
      where: { pipelineKind: PipelineKind.TEAM, inPool: false, handlerId: { not: null }, isShadow: false },
      _count: { handlerId: true },
    });
    return {
      users,
      leads,
      handlerLoad: handlerLoad.map((r) => ({
        handlerId: r.handlerId,
        activeLeads: r._count.handlerId,
      })),
    };
  });
}
