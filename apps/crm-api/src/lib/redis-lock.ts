import { getIoredis } from "../realtime/redis-client.js";

export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const r = getIoredis();
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
    const r = getIoredis();
    await r.del(`lock:${key}`);
  } catch {
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
