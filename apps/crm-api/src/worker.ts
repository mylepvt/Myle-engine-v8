import { startWorkers } from "./queues/runtime.js";
import { getRedisEmitter } from "./realtime/emitter.js";
import { closeRedis } from "./realtime/redis-client.js";

const emitter = getRedisEmitter();
if (emitter) {
  console.log("[crm-worker] Redis emitter initialized");
}

startWorkers().catch((e) => {
  console.error(e);
  process.exit(1);
});

const shutdown = async () => {
  await closeRedis();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
