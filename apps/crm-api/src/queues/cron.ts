import type { Queue } from "bullmq";
import {
  JOB_CHECK_STALE,
  JOB_RANK_RECALC,
  JOB_REASSIGN,
  QUEUE_LEAD,
  QUEUE_RANKING,
} from "./names.js";

export type CronQueues = {
  lead: Queue;
  ranking: Queue;
};

/**
 * Every 60s (configurable): REASSIGN tier → CHECK_STALE tier → RANK_RECALC.
 * Lead queue uses concurrency 1 so ordering is preserved within the worker.
 */
export function startScheduler(queues: CronQueues) {
  const intervalMs = Number(process.env.CRM_SCHEDULER_INTERVAL_MS ?? 60_000);

  const tick = async () => {
    const tickId = Date.now();
    try {
      await queues.lead.add(JOB_REASSIGN, { kind: JOB_REASSIGN }, { jobId: `reassign-${tickId}`, removeOnComplete: 100 });
      await queues.lead.add(
        JOB_CHECK_STALE,
        { kind: JOB_CHECK_STALE },
        { jobId: `check-${tickId}`, removeOnComplete: 100 },
      );
      await queues.ranking.add(
        JOB_RANK_RECALC,
        { pipelineKinds: ["TEAM", "PERSONAL"] as const },
        { jobId: `rank-${tickId}`, removeOnComplete: 100 },
      );
    } catch (e) {
      console.error("[crm-scheduler] tick failed", e);
    }
  };

  const t = setInterval(() => void tick(), intervalMs);
  void tick();

  console.log(
    `[crm-scheduler] ${QUEUE_LEAD} + ${QUEUE_RANKING} every ${intervalMs}ms — ${JOB_REASSIGN}, ${JOB_CHECK_STALE}, ${JOB_RANK_RECALC}`,
  );

  return () => clearInterval(t);
}
