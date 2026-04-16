import { createClient, type RedisClientType } from "redis";
import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";

const REDIS_URL = process.env.CRM_REDIS_URL ?? "redis://127.0.0.1:6379";

let client: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({ url: REDIS_URL });
    client.on("error", (err) => console.error("[redis-score]", err));
    await client.connect();
  }
  return client;
}

function zsetKey(pipelineKind: PipelineKind) {
  return `crm:perf:z:${pipelineKind}`;
}

function userScoreKey(userId: string, pipelineKind: PipelineKind) {
  return `crm:perf:score:${pipelineKind}:${userId}`;
}

/** Realtime ranking — primary source for Top 10. */
export async function getRealtimeScore(userId: string, pipelineKind: PipelineKind): Promise<number | null> {
  try {
    const r = await getRedis();
    const v = await r.get(userScoreKey(userId, pipelineKind));
    if (v === null) return null;
    return Number(v);
  } catch {
    return null;
  }
}

export async function setRealtimeScore(userId: string, pipelineKind: PipelineKind, score: number) {
  const r = await getRedis();
  await r.set(userScoreKey(userId, pipelineKind), String(score));
  await r.zAdd(zsetKey(pipelineKind), [{ score, value: userId }]);
}

/** Increment realtime score on meaningful activity (FSM transition, claim, etc.). */
export async function bumpRealtimeScoreOnActivity(
  userId: string,
  pipelineKind: PipelineKind,
  delta: number = 0.25,
) {
  try {
    const cur = (await getRealtimeScore(userId, pipelineKind)) ?? 0;
    await setRealtimeScore(userId, pipelineKind, cur + delta);
  } catch (e) {
    console.error("[redis-score] bump failed", e);
  }
}

/**
 * Top N user ids by realtime score (Redis ZSET). If Redis is empty or thin, hydrate from DB snapshots then retry.
 */
export async function getTopUserIdsByRealtimeScore(pipelineKind: PipelineKind, limit = 10): Promise<string[]> {
  const r = await getRedis();
  let ids = await r.zRange(zsetKey(pipelineKind), 0, limit - 1, { REV: true });
  if (ids.length >= Math.min(5, limit)) return ids;

  const rows = await prisma.userPerformanceSnapshot.findMany({
    where: { pipelineKind, windowLabel: "rolling_30d" },
    orderBy: { compositeScore: "desc" },
    take: limit,
  });
  for (const row of rows) {
    await setRealtimeScore(row.userId, pipelineKind, row.compositeScore);
  }
  ids = await r.zRange(zsetKey(pipelineKind), 0, limit - 1, { REV: true });
  return ids.length ? ids : rows.map((x) => x.userId);
}
