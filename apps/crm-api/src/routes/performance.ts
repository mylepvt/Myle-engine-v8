import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { recomputeUserPerformance } from "../services/performance.service.js";

export async function performanceRoutes(fastify: FastifyInstance) {
  fastify.get("/performance/snapshots", async (req) => {
    const user = requireAuth(req);
    const q = z.object({ pipelineKind: z.nativeEnum(PipelineKind).optional() }).parse(req.query);
    return prisma.userPerformanceSnapshot.findMany({
      where: { userId: user.id, ...(q.pipelineKind ? { pipelineKind: q.pipelineKind } : {}) },
      orderBy: { computedAt: "desc" },
    });
  });

  fastify.post("/performance/recompute", async (req) => {
    const user = requireAuth(req);
    const body = z.object({ pipelineKind: z.nativeEnum(PipelineKind) }).parse(req.body);
    const snap = await recomputeUserPerformance(user.id, body.pipelineKind);
    fastify.io.to(`user:${user.id}`).emit("performance.updated", {
      userId: user.id,
      pipelineKind: body.pipelineKind,
      compositeScore: snap.compositeScore,
    });
    return snap;
  });
}
