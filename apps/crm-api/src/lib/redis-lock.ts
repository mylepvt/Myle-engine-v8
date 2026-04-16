import { Redis } from "ioredis";

const REDIS_URL = process.env.CRM_REDIS_URL ?? "redis://127.0.0.1:6379";

let client: Redis | null = null;

function getRedis(): Redis {
  if (!client) {
    client = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    client.on("error", (e: Error) => console.error("[redis-lock]", e));
  }
  return client;
}

/**
 * Distributed lock — SET key NX EX ttlSeconds. Returns true if lock acquired.
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const r = getRedis();
    const full = `lock:${key}`;
    const res = await r.set(full, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  } catch (e) {
    console.warn("[redis-lock] acquire degraded (single-instance mode):", e);
    return true;
  }
}

export async function releaseLock(key: string): Promise<void> {
  try {
    const r = getRedis();
    await r.del(`lock:${key}`);
  } catch {
    /* ignore */
  }
}

export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const ok = await acquireLock(key, ttlSeconds);
  if (!ok) return null;
  try {
    return await fn();
  } finally {
    await releaseLock(key);
  }
}
