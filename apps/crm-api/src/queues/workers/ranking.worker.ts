import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../../db.js";
import { pickLeastLoadedHandler, recomputeUserPerformance } from "../../services/performance.service.js";
import { JOB_RANK_RECALC, QUEUE_RANKING } from "../names.js";

/**
 * Handler load is derived from active lead counts per handler; `pickLeastLoadedHandler` uses DB groupBy.
 * This job recomputes Redis + DB snapshots so Top‑10 + least-load stay aligned.
 */
export function createRankingWorker(connection: ConnectionOptions) {
  const concurrency = Number(process.env.CRM_RANKING_WORKER_CONCURRENCY ?? 2);

  return new Worker(
    QUEUE_RANKING,
    async (job) => {
      if (job.name !== JOB_RANK_RECALC) return { skipped: true };

      const users = await prisma.user.findMany({
        where: { role: { in: ["team", "leader"] }, active: true },
        select: { id: true },
      });

      const kinds: PipelineKind[] = [PipelineKind.TEAM, PipelineKind.PERSONAL];
      let n = 0;
      for (const u of users) {
        for (const pk of kinds) {
          await recomputeUserPerformance(u.id, pk);
          n += 1;
        }
      }

      const teamIds = users.map((x) => x.id);
      const sample =
        teamIds.length > 0
          ? await pickLeastLoadedHandler(PipelineKind.TEAM, teamIds.slice(0, 20))
          : null;

      return { recomputed: n, sampleLeastLoaded: sample };
    },
    { connection, concurrency },
  );
}
