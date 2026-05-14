import { Emitter } from "@socket.io/redis-emitter";
import { getIoredis } from "./redis-client.js";

let _emitter: Emitter | null = null;

export function getRedisEmitter() {
  if (!_emitter) {
    const client = getIoredis();
    _emitter = new Emitter(client);
  }
  return _emitter;
}
