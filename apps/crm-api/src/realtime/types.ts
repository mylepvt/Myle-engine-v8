import type { z } from "zod";
import type { EventContractSchema } from "./contracts.js";

export type EventContract = z.infer<typeof EventContractSchema>;

export type EventPriority = "high" | "medium" | "low";
export type EventSource = "api" | "worker" | "fastapi";

export type EventReceipt = {
  id: string;
  published: boolean;
  deduplicated: boolean;
  timestamp: number;
};

export interface EventGateway {
  publish(event: {
    type: string;
    payload: Record<string, unknown>;
    rooms?: string[];
    priority?: "high" | "medium" | "low";
    source?: "api" | "worker" | "fastapi";
    id?: string;
    idempotencyKey?: string;
    correlationId?: string;
    causationId?: string;
  }): Promise<EventReceipt>;
}

export type RoomResolver = (event: EventContract) => string[];
