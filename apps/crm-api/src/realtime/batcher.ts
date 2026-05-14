import type { EventContract } from "./types.js";

type BatchEntry = { event: EventContract; resolve: () => void; reject: (e: Error) => void };

const BATCH_WINDOW_MS = 50;
const MAX_BATCH_SIZE = 20;

export class EventBatcher {
  private batches = new Map<string, BatchEntry[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  onFlush?: (batchKey: string, events: EventContract[]) => void;

  async add(event: EventContract): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = this.batchKey(event);
      let entries = this.batches.get(key);
      if (!entries) {
        entries = [];
        this.batches.set(key, entries);
      }
      entries.push({ event, resolve, reject });

      if (entries.length >= MAX_BATCH_SIZE) {
        this.flush(key);
      } else if (!this.timers.has(key)) {
        const timer = setTimeout(() => this.flush(key), BATCH_WINDOW_MS);
        if (timer.unref) timer.unref();
        this.timers.set(key, timer);
      }
    });
  }

  private batchKey(event: EventContract): string {
    const sorted = [...event.rooms].sort();
    return `${event.type}::${sorted.join(",")}`;
  }

  private flush(key: string) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    const entries = this.batches.get(key);
    if (!entries || entries.length === 0) return;
    this.batches.delete(key);

    const events = entries.map((e) => e.event);
    try {
      if (this.onFlush) {
        this.onFlush(key, events);
      }
      for (const entry of entries) {
        entry.resolve();
      }
    } catch (e) {
      for (const entry of entries) {
        entry.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  drain() {
    for (const key of this.batches.keys()) {
      this.flush(key);
    }
  }

  destroy() {
    this.drain();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
