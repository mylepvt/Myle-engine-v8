import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { recordAudit, type AuditSource } from "../../services/audit.service.js";
import { JOB_AUDIT_RECORD, QUEUE_AUDIT } from "../names.js";

export type AuditJobPayload = {
  source: AuditSource;
  action: string;
  leadId?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
  amountCents?: number | null;
  idempotencyKey?: string | null;
  meta?: Record<string, unknown> | null;
};

export function createAuditWorker(connection: ConnectionOptions) {
  const concurrency = Number(process.env.CRM_AUDIT_WORKER_CONCURRENCY ?? 10);

  return new Worker(
    QUEUE_AUDIT,
    async (job) => {
      if (job.name !== JOB_AUDIT_RECORD) return { skipped: true };
      const data = job.data as AuditJobPayload;
      const row = await recordAudit({
        source: data.source,
        action: data.action,
        leadId: data.leadId,
        actorId: data.actorId,
        targetUserId: data.targetUserId,
        amountCents: data.amountCents,
        idempotencyKey: data.idempotencyKey,
        meta: data.meta,
      });
      return { persisted: Boolean(row) };
    },
    { connection, concurrency },
  );
}
