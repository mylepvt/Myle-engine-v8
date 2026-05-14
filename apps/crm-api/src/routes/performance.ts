import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { recomputeUserPerformance } from "../services/performance.service.js";
import { emitAdminActivity } from "../realtime/emit.js";

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
    const payload = { userId: user.id, pipelineKind: body.pipelineKind, compositeScore: snap.compositeScore };
    fastify.io.to(`user:${user.id}`).emit("performance.updated", payload);
    fastify.gateway.publish({
      type: "performance:score_updated",
      payload,
      priority: "medium",
      idempotencyKey: `perf:score:${user.id}:${body.pipelineKind}:${Date.now()}`,
    }).catch(() => {});
    emitAdminActivity(fastify.io, fastify.gateway, {
      action: "performance:recomputed",
      actorId: user.id,
      targetId: user.id,
      targetType: "user",
      description: `Performance recomputed for ${body.pipelineKind} (score: ${snap.compositeScore.toFixed(1)})`,
      metadata: { pipelineKind: body.pipelineKind, compositeScore: snap.compositeScore, breakdown: snap.breakdown },
      severity: "info",
    });
    return snap;
  });
}
