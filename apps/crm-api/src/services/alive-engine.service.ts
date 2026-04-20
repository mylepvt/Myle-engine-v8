import type { Server } from "socket.io";

/**
 * Lead lifecycle ownership moved to FastAPI. CRM no longer mutates lead assignment
 * or writes escalation rows; these worker hooks stay as safe no-ops so existing
 * queue wiring can remain deployed during the cutover.
 */
export async function runAliveReassignTier(io?: Server) {
  void io;
  return { reassigned: 0 };
}

/**
 * Escalation ownership also moved to FastAPI; keep returning empty counters.
 */
export async function runAliveCheckStaleTier(io?: Server) {
  void io;
  return { warned: 0, leaderAlerts: 0, adminEsc: 0 };
}

/**
 * Full pass stays wired for operational continuity, but performs no lead writes.
 */
export async function runAliveEnginePass(io?: Server) {
  const r1 = await runAliveReassignTier(io);
  const r2 = await runAliveCheckStaleTier(io);
  return {
    warned: r2.warned,
    reassigned: r1.reassigned,
    leaderAlerts: r2.leaderAlerts,
    adminEsc: r2.adminEsc,
  };
}
