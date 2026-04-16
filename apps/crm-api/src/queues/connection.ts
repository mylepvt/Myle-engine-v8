import type { ConnectionOptions } from "bullmq";

const REDIS_URL = process.env.CRM_REDIS_URL ?? "redis://127.0.0.1:6379";

/** BullMQ + ioredis-compatible connection from CRM_REDIS_URL */
export function bullmqConnection(): ConnectionOptions {
  const u = new URL(REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    maxRetriesPerRequest: null,
  };
}
