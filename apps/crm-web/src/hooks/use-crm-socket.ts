"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useAdminFeedStore, type AdminActivityEntry } from "@/stores/admin-feed-store";

const API = process.env.NEXT_PUBLIC_CRM_API_URL ?? "http://127.0.0.1:4000";

const CLIENT_DEDUP_SET_MAX = 1000;
const CLIENT_DEDUP_TTL_MS = 30_000;

let _lastEventIds: string[] = [];
const _seenIds = new Set<string>();

function isDuplicate(eventId: string): boolean {
  if (_seenIds.has(eventId)) return true;
  _seenIds.add(eventId);
  _lastEventIds.push(eventId);
  if (_lastEventIds.length > CLIENT_DEDUP_SET_MAX) {
    const oldest = _lastEventIds.shift()!;
    _seenIds.delete(oldest);
  }
  setTimeout(() => {
    _seenIds.delete(eventId);
    const idx = _lastEventIds.indexOf(eventId);
    if (idx >= 0) _lastEventIds.splice(idx, 1);
  }, CLIENT_DEDUP_TTL_MS);
  return false;
}

export function useCrmSocket(enabled: boolean) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const pushEntry = useAdminFeedStore((s) => s.pushEntry);

  useEffect(() => {
    if (!enabled) return;
    const s = io(API, {
      transports: ["websocket"],
      auth: { token: process.env.NEXT_PUBLIC_CRM_SOCKET_TOKEN ?? "" },
    });
    socketRef.current = s;

    s.on("lead.updated", () => {
      void qc.invalidateQueries({ queryKey: ["crm-leads"] });
    });
    s.on("wallet.claimed", () => {
      void qc.invalidateQueries({ queryKey: ["crm-wallet"] });
    });
    s.on("performance.updated", () => {
      void qc.invalidateQueries({ queryKey: ["crm-performance"] });
    });
    s.on("lead.assigned", (payload: { leadId: string; handlerId: string }) => {
      void qc.invalidateQueries({ queryKey: ["crm-leads"] });
    });

    s.on("admin:activity", (payload: Record<string, unknown>) => {
      if (isDuplicate((payload as { id?: string }).id ?? `${payload.action}-${Date.now()}`)) return;
      const entry: AdminActivityEntry = {
        id: (payload as { id?: string }).id ?? `${payload.action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: payload.action as string,
        actorId: payload.actorId as string | undefined,
        actorName: payload.actorName as string | undefined,
        targetId: payload.targetId as string | undefined,
        targetType: payload.targetType as string | undefined,
        description: payload.description as string,
        severity: (payload.severity as "info" | "warning" | "error") ?? "info",
        timestamp: (payload.timestamp as number) ?? Date.now(),
        metadata: payload.metadata as Record<string, unknown> | undefined,
      };
      pushEntry(entry);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [enabled, qc, pushEntry]);
}
