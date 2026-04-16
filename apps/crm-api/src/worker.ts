/**
 * BullMQ worker entry — queues registered in src/queues/index.ts
 * Run: npm run worker --workspace=crm-api
 */
import { startWorkers } from "./queues/runtime.js";

startWorkers().catch((e) => {
  console.error(e);
  process.exit(1);
});
