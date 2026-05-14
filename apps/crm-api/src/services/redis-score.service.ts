import { PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { getRedisV4 } from "../realtime/redis-client.js";

function zsetKey(pipelineKind: PipelineKind) {
  return `crm:perf:z:${pipelineKind}`;
}

function userScoreKey(userId: string, pipelineKind: PipelineKind) {
  return `crm:perf:score:${pipelineKind}:${userId}`;
}

export async function getRealtimeScore(userId: string, pipelineKind: PipelineKind): Promise<number | null> {
  try {
    const r = await getRedisV4();
    const v = await r.get(userScoreKey(userId, pipelineKind));
    if (v === null) return null;
    return Number(v);
  } catch {
    return null;
  }
}

export async function setRealtimeScore(userId: string, pipelineKind: PipelineKind, score: number) {
  const r = await getRedisV4();
  await r.set(userScoreKey(userId, pipelineKind), String(score));
  await r.zAdd(zsetKey(pipelineKind), [{ score, value: userId }]);
}

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

export async function getTopUserIdsByRealtimeScore(pipelineKind: PipelineKind, limit = 10): Promise<string[]> {
  const r = await getRedisV4();
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
