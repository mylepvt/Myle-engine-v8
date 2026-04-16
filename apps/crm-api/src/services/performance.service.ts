import { LeadStage, PipelineKind } from "@prisma/client";
import { prisma } from "../db.js";
import { setRealtimeScore } from "./redis-score.service.js";

/** Deterministic composite score — DB snapshot + Redis realtime for Top 10 ranking. */
export async function recomputeUserPerformance(userId: string, pipelineKind: PipelineKind) {
  const closed = await prisma.lead.count({
    where: { closedById: userId, pipelineKind, stage: LeadStage.CLOSED },
  });
  const assigned = await prisma.lead.count({
    where: { handlerId: userId, pipelineKind },
  });
  const conversionRate = assigned > 0 ? closed / assigned : 0;
  const compositeScore = conversionRate * 100 + (assigned > 0 ? 10 : 0);

  const row = await prisma.userPerformanceSnapshot.upsert({
    where: {
      userId_pipelineKind_windowLabel: {
        userId,
        pipelineKind,
        windowLabel: "rolling_30d",
      },
    },
    create: {
      userId,
      pipelineKind,
      windowLabel: "rolling_30d",
      conversionRate,
      avgResponseSec: 120,
      activityScore: assigned,
      compositeScore,
      breakdown: { closed, assigned },
    },
    update: {
      conversionRate,
      activityScore: assigned,
      compositeScore,
      breakdown: { closed, assigned },
      computedAt: new Date(),
    },
  });
  await setRealtimeScore(userId, pipelineKind, row.compositeScore);
  return row;
}

export async function pickLeastLoadedHandler(
  pipelineKind: PipelineKind,
  candidateUserIds: string[],
): Promise<string | null> {
  if (candidateUserIds.length === 0) return null;
  const loads = await prisma.lead.groupBy({
    by: ["handlerId"],
    where: {
      handlerId: { in: candidateUserIds },
      pipelineKind,
      inPool: false,
    },
    _count: { handlerId: true },
  });
  const map = new Map(loads.map((l) => [l.handlerId!, l._count.handlerId]));
  let best = candidateUserIds[0]!;
  let bestLoad = map.get(best) ?? 0;
  for (const uid of candidateUserIds) {
    const load = map.get(uid) ?? 0;
    if (load < bestLoad) {
      best = uid;
      bestLoad = load;
    }
  }
  return best;
}
