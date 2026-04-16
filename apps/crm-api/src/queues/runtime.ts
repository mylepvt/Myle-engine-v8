/**
 * BullMQ runtime — separate process from HTTP (`npm run worker`).
 * Queues: lead processing, wallet, ranking, audit + 60s scheduler.
 */
import { Queue } from "bullmq";
import { bullmqConnection } from "./connection.js";
import { startScheduler } from "./cron.js";
import { QUEUE_AUDIT, QUEUE_LEAD, QUEUE_RANKING, QUEUE_WALLET } from "./names.js";
import { createLeadWorker } from "./workers/lead.worker.js";
import { createWalletWorker } from "./workers/wallet.worker.js";
import { createRankingWorker } from "./workers/ranking.worker.js";
import { createAuditWorker } from "./workers/audit.worker.js";

export async function startWorkers() {
  const connection = bullmqConnection();

  const leadQueue = new Queue(QUEUE_LEAD, { connection });
  const walletQueue = new Queue(QUEUE_WALLET, { connection });
  const rankingQueue = new Queue(QUEUE_RANKING, { connection });
  const auditQueue = new Queue(QUEUE_AUDIT, { connection });

  const leadWorker = createLeadWorker(connection);
  const walletWorker = createWalletWorker(connection);
  const rankingWorker = createRankingWorker(connection);
  const auditWorker = createAuditWorker(connection);

  const stopScheduler = startScheduler({ lead: leadQueue, ranking: rankingQueue });

  const onFail = (name: string) => (job: { id?: string } | undefined, err: Error) =>
    console.error(`[${name}] failed`, job?.id, err);

  leadWorker.on("failed", onFail("lead"));
  walletWorker.on("failed", onFail("wallet"));
  rankingWorker.on("failed", onFail("ranking"));
  auditWorker.on("failed", onFail("audit"));

  console.log(
    `[crm-worker] listening — ${QUEUE_LEAD}, ${QUEUE_WALLET}, ${QUEUE_RANKING}, ${QUEUE_AUDIT}`,
  );

  const shutdown = async () => {
    stopScheduler();
    await Promise.all([
      leadWorker.close(),
      walletWorker.close(),
      rankingWorker.close(),
      auditWorker.close(),
      leadQueue.close(),
      walletQueue.close(),
      rankingQueue.close(),
      auditQueue.close(),
    ]);
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
}
