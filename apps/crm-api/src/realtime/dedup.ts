import { getRedisV4 } from "./redis-client.js";

const DEDUP_TTL_SECONDS = 300;
const DEDUP_PREFIX = "crm:dedup:event:";

export class EventDedup {
  async isDuplicate(eventId: string): Promise<boolean> {
    try {
      const r = await getRedisV4();
      const key = `${DEDUP_PREFIX}${eventId}`;
      const result = await r.set(key, "1", { NX: true, EX: DEDUP_TTL_SECONDS });
      return result !== "OK";
    } catch {
      return false;
    }
  }
}
