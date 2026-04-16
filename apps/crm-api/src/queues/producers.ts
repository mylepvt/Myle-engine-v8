import { Queue } from "bullmq";
import { bullmqConnection } from "./connection.js";
import {
  JOB_AUDIT_RECORD,
  JOB_WALLET_CREDIT,
  QUEUE_AUDIT,
  QUEUE_LEAD,
  QUEUE_RANKING,
  QUEUE_WALLET,
} from "./names.js";
import type { AuditJobPayload } from "./workers/audit.worker.js";
import type { WalletCreditJobData } from "./workers/wallet.worker.js";

const connection = bullmqConnection();

let _lead: Queue | null = null;
let _wallet: Queue | null = null;
let _ranking: Queue | null = null;
let _audit: Queue | null = null;

export function getLeadQueue() {
  if (!_lead) _lead = new Queue(QUEUE_LEAD, { connection });
  return _lead;
}

export function getWalletQueue() {
  if (!_wallet) _wallet = new Queue(QUEUE_WALLET, { connection });
  return _wallet;
}

export function getRankingQueue() {
  if (!_ranking) _ranking = new Queue(QUEUE_RANKING, { connection });
  return _ranking;
}

export function getAuditQueue() {
  if (!_audit) _audit = new Queue(QUEUE_AUDIT, { connection });
  return _audit;
}

/** Fire-and-forget audit (async path — API may still use sync `recordAudit`). */
export async function enqueueAuditRecord(payload: AuditJobPayload) {
  await getAuditQueue().add(JOB_AUDIT_RECORD, payload, {
    removeOnComplete: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

export async function enqueueWalletCredit(payload: WalletCreditJobData) {
  await getWalletQueue().add(JOB_WALLET_CREDIT, payload, {
    jobId: `wc:${payload.idempotencyKey}`,
    removeOnComplete: 100,
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
  });
}
