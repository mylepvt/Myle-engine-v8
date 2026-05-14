"use client";

import { useCrmSocket } from "@/hooks/use-crm-socket";

export function SocketProvider({ children }: { children: React.ReactNode }) {
  useCrmSocket(true);
  return <>{children}</>;
}
