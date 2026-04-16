"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_CRM_API_URL ?? "http://127.0.0.1:4000";

/**
 * Subscribes to crm-api Socket.io; invalidates React Query keys on domain events.
 * Zustand stays for UI-only state — this hook only bridges realtime → server cache.
 */
export function useCrmSocket(enabled: boolean) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

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
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [enabled, qc]);
}
