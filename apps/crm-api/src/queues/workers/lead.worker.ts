import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { runAliveCheckStaleTier, runAliveReassignTier } from "../../services/alive-engine.service.js";
import { resolveFsmTransition, type FsmEvent } from "../../domain/fsm.js";
import { prisma } from "../../db.js";
import { LeadStage } from "@prisma/client";
import { JOB_CHECK_STALE, JOB_FSM_VALIDATE, JOB_REASSIGN, QUEUE_LEAD } from "../names.js";

/** Optional deep validation job — verifies lead row still matches FSM expectations. */
export function createLeadWorker(connection: ConnectionOptions) {
  const concurrency = Number(process.env.CRM_LEAD_WORKER_CONCURRENCY ?? 1);

  return new Worker(
    QUEUE_LEAD,
    async (job) => {
      switch (job.name) {
        case JOB_REASSIGN:
          return runAliveReassignTier(undefined);
        case JOB_CHECK_STALE:
          return runAliveCheckStaleTier(undefined);
        case JOB_FSM_VALIDATE:
          return runFsmValidateJob(job.data as { leadId: string; event: FsmEvent });
        default:
          return runAliveReassignTier(undefined).then(() => runAliveCheckStaleTier(undefined));
      }
    },
    { connection, concurrency },
  );
}

async function runFsmValidateJob(data: { leadId: string; event: FsmEvent }) {
  const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
  if (!lead) return { ok: false, reason: "NOT_FOUND" };
  if (lead.stage === LeadStage.CLOSED) return { ok: false, reason: "CLOSED" };
  try {
    resolveFsmTransition(lead.stage, data.event);
    return { ok: true, stage: lead.stage };
  } catch {
    return { ok: false, reason: "FSM_REJECT" };
  }
}
