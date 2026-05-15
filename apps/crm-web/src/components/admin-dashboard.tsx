"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAdminFeedStore, type AdminActivityEntry } from "@/stores/admin-feed-store";

const API = process.env.NEXT_PUBLIC_CRM_API_URL ?? "http://127.0.0.1:4000";

const ACTION_ICONS: Record<string, string> = {
  "lead:created": "＋",
  "lead:transitioned": "→",
  "lead:assigned": "⇄",
  "lead:auto_reassigned": "⚡",
  "lead:closed": "✓",
  "lead:claimed": "⬇",
  "lead:batch_claimed": "⬇",
  "lead:claim_duplicate": "⚠",
  "lead:shadow_created": "☁",
  "lead:shadow_synced": "☁",
  "lead:shadow_deleted": "✕",
  "wallet:credited": "₹",
  "wallet:credited_worker": "₹",
  "performance:recomputed": "📊",
  "system:ranking_recalc": "🔄",
  "system:scheduler_tick": "⏱",
  "fsm:validation_failed": "✗",
};

const SEVERITY_STYLES: Record<string, { dot: string; bg: string; label: string }> = {
  info:    { dot: "bg-blue-500", bg: "bg-zinc-800/50 hover:bg-zinc-700/50", label: "text-blue-400" },
  warning: { dot: "bg-amber-500", bg: "bg-amber-900/10 hover:bg-amber-900/20", label: "text-amber-400" },
  error:   { dot: "bg-red-500", bg: "bg-red-900/10 hover:bg-red-900/20", label: "text-red-400" },
};

function ActivityIcon({ action }: { action: string }) {
  const icon = ACTION_ICONS[action] ?? "•";
  return <span className="text-base w-6 text-center shrink-0">{icon}</span>;
}

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const styles = SEVERITY_STYLES[entry.severity] ?? SEVERITY_STYLES.info;
  const time = new Date(entry.timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
  return (
    <div className={`flex items-start gap-3 px-4 md:px-5 py-3 border-b border-zinc-800/50 transition ${styles.bg}`}>
      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />
      <ActivityIcon action={entry.action} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {entry.actorName && (
            <span className="font-medium text-zinc-200 truncate max-w-[120px]">{entry.actorName}</span>
          )}
          <span className="text-zinc-300 truncate">{entry.description}</span>
        </div>
        {entry.targetId && (
          <div className="text-[11px] text-zinc-600 font-mono mt-1">
            {entry.targetType} / {entry.targetId}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[11px] font-medium uppercase ${styles.label}`}>{entry.severity}</span>
        <span className="text-[11px] text-zinc-600 w-12 text-right">{time}</span>
      </div>
    </div>
  );
}

function PresencePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-admin-presence"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/v1/admin/presence`);
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{
        online: number; idle: number; total: number;
        users: Array<{ userId: string; name: string | null; status: string; lastSeen: number; role?: string }>;
      }>;
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 md:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-4">Live Presence</h3>
      {isLoading ? (
        <p className="text-sm text-zinc-600">Loading...</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm text-zinc-300">{data?.online ?? 0} online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-zinc-300">{data?.idle ?? 0} idle</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-600 shrink-0" />
              <span className="text-sm text-zinc-300">{data?.total ?? 0} total</span>
            </div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data?.users.slice(0, 20).map((u) => (
              <div key={u.userId} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  u.status === "online" ? "bg-emerald-500" : u.status === "idle" ? "bg-amber-500" : "bg-zinc-700"
                }`} />
                <span className="truncate flex-1">{u.name ?? u.userId.slice(0, 12)}</span>
                {u.role && <span className="text-zinc-600 uppercase text-[10px]">{u.role}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QuickStats() {
  const entries = useAdminFeedStore((s) => s.entries);
  const now = Date.now();
  const last5min = entries.filter((e) => now - e.timestamp < 300_000).length;
  const last1hour = entries.filter((e) => now - e.timestamp < 3_600_000).length;

  const byAction = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries.slice(0, 200)) {
      map.set(e.action, (map.get(e.action) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [entries]);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 md:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-4">Activity Stats</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-100 leading-tight">{last5min}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Last 5 min</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-100 leading-tight">{last1hour}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Last hour</div>
        </div>
      </div>
      <div className="space-y-2">
        {byAction.map(([action, count]) => (
          <div key={action} className="flex items-center justify-between text-xs text-zinc-400">
            <span className="truncate">{action}</span>
            <span className="text-zinc-500 ml-2 shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const entries = useAdminFeedStore((s) => s.entries);
  const unreadCount = useAdminFeedStore((s) => s.unreadCount);
  const paused = useAdminFeedStore((s) => s.paused);
  const pushEntry = useAdminFeedStore((s) => s.pushEntry);

  const [filterAction, setFilterAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = entries;
    if (filterAction) result = result.filter((e) => e.action === filterAction);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.description.toLowerCase().includes(q) ||
        e.actorName?.toLowerCase().includes(q) ||
        e.targetId?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, filterAction, search]);

  const actionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.action, (map.get(e.action) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100 leading-tight">Admin Control Center</h1>
        <p className="text-sm text-zinc-500 mt-2 leading-normal">
          Realtime activity · {entries.length} events · {unreadCount > 0 && `${unreadCount} unread`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 md:gap-6">
        <div className="lg:col-span-3 space-y-5 md:space-y-6">
          {/* Filter bar */}
          <div className="rounded-xl border border-zinc-700 bg-zinc-900">
            <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-b border-zinc-800">
              <button
                type="button"
                onClick={() => useAdminFeedStore.getState().setPaused(!paused)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  paused ? "bg-amber-600 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button
                type="button"
                onClick={() => useAdminFeedStore.getState().markAllRead()}
                className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
              >
                Mark read
              </button>
              {filterAction && (
                <button
                  type="button"
                  onClick={() => setFilterAction(null)}
                  className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-amber-400 hover:bg-zinc-700"
                >
                  ✕ {filterAction}
                </button>
              )}
              <input
                type="text"
                placeholder="Search activity..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ml-auto w-48 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"
              />
            </div>

            {/* Action filter chips */}
            <div className="flex flex-wrap gap-1.5 px-4 md:px-5 py-3 border-b border-zinc-800/50 overflow-x-auto">
              {actionCounts.map(([action, count]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setFilterAction(filterAction === action ? null : action)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono transition whitespace-nowrap ${
                    filterAction === action
                      ? "bg-zinc-600 text-white"
                      : "bg-zinc-800/70 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  {ACTION_ICONS[action] ?? "•"} {action.split(":").pop()} ({count})
                </button>
              ))}
            </div>

            {/* Activity list */}
            <div className="divide-y divide-transparent max-h-[600px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                  <span className="text-2xl mb-2">📭</span>
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Real-time events will appear here</p>
                </div>
              ) : (
                filtered.slice(0, 300).map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5 md:space-y-6">
          <QuickStats />
          <PresencePanel />
        </div>
      </div>
    </div>
  );
}
