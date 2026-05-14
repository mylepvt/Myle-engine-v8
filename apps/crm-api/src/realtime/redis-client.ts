import { Redis as Ioredis } from "ioredis";
import { createClient as createRedisV4, type RedisClientType } from "redis";

const REDIS_URL = process.env.CRM_REDIS_URL ?? "redis://127.0.0.1:6379";
const REDIS_PARSE = new URL(REDIS_URL);
const CONNECTION_TIMEOUT_MS = 5_000;

let _ioredis: Ioredis | null = null;
let _redisV4: RedisClientType | null = null;

export function getIoredis(): Ioredis {
  if (!_ioredis) {
    _ioredis = new Ioredis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: CONNECTION_TIMEOUT_MS,
      lazyConnect: true,
    });
    _ioredis.on("error", (e) => console.error("[redis-ioredis]", e));
    _ioredis.connect().catch((e) => console.error("[redis-ioredis] connect failed", e));
  }
  return _ioredis;
}

export async function getRedisV4(): Promise<RedisClientType> {
  if (!_redisV4) {
    _redisV4 = createRedisV4({
      url: REDIS_URL,
      socket: {
        connectTimeout: CONNECTION_TIMEOUT_MS,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
      },
    });
    _redisV4.on("error", (e) => console.error("[redis-v4]", e));
    await _redisV4.connect();
  }
  return _redisV4;
}

export function bullmqConnectionOptions() {
  return {
    host: REDIS_PARSE.hostname,
    port: Number(REDIS_PARSE.port || 6379),
    maxRetriesPerRequest: null,
  };
}

export async function closeRedis() {
  if (_ioredis) {
    try { await _ioredis.quit(); } catch { _ioredis.disconnect(); }
    _ioredis = null;
  }
  if (_redisV4) {
    try { await _redisV4.quit(); } catch { }
    _redisV4 = null;
  }
}
