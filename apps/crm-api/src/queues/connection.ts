import type { ConnectionOptions } from "bullmq";
import { bullmqConnectionOptions } from "../realtime/redis-client.js";

export function bullmqConnection(): ConnectionOptions {
  return bullmqConnectionOptions();
}
