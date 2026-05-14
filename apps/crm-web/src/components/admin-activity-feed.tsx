"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useAdminFeedStore, type AdminActivityEntry } from "@/stores/admin-feed-store";

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

const SEVERITY_BG: Record<string, string> = {
  info: "bg-blue-900/20 border-blue-800/30",
  warning: "bg-amber-900/20 border-amber-800/30",
  error: "bg-red-900/20 border-red-800/30",
};

const ACTION_ICONS: Record<string, string> = {
  "lead:transitioned": "→",
  "lead:assigned": "⇄",
  "lead:auto_reassigned": "⚡",
  "lead:closed": "✓",
  "lead:claimed": "↓",
  "lead:batch_claimed": "↓",
  "wallet:debited": "₹",
  "wallet:credited": "₹",
  "lead:created": "+",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ActivityItem({ entry }: { entry: AdminActivityEntry }) {
  const icon = ACTION_ICONS[entry.action] ?? "•";
  return (
    <div className={`flex items-start gap-3 rounded border p-3 text-sm ${SEVERITY_BG[entry.severity] ?? SEVERITY_BG.info}`}>
      <span className={`mt-0.5 text-base font-bold ${SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.info}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {entry.actorName && (
            <span className="font-medium text-zinc-200 truncate">{entry.actorName}</span>
          )}
          <span className={`text-xs font-medium uppercase ${SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.info}`}>
            {entry.severity}
          </span>
        </div>
        <p className="text-zinc-300 mt-0.5">{entry.description}</p>
        {entry.targetId && (
          <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate">
            {entry.targetType}/{entry.targetId.slice(0, 12)}…
          </p>
        )}
      </div>
      <span className="text-xs text-zinc-500 whitespace-nowrap">{formatTime(entry.timestamp)}</span>
    </div>
  );
}

export function AdminActivityFeed() {
  const entries = useAdminFeedStore((s) => s.entries);
  const unreadCount = useAdminFeedStore((s) => s.unreadCount);
  const paused = useAdminFeedStore((s) => s.paused);
  const filters = useAdminFeedStore((s) => s.filters);
  const markAllRead = useAdminFeedStore((s) => s.markAllRead);
  const setPaused = useAdminFeedStore((s) => s.setPaused);
  const setFilter = useAdminFeedStore((s) => s.setFilter);
  const clearFilters = useAdminFeedStore((s) => s.clearFilters);

  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = entries;
    if (filters.actions.length > 0) {
      result = result.filter((e) => filters.actions.includes(e.action));
    }
    if (filters.severity.length > 0) {
      result = result.filter((e) => filters.severity && filters.severity.includes(e.severity));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((e) => e.description.toLowerCase().includes(q));
    }
    return result;
  }, [entries, filters]);

  const actionTypes = useMemo(() => {
    const s = new Set(entries.map((e) => e.action));
    return Array.from(s).sort();
  }, [entries]);

  const handleFilterAction = useCallback((action: string) => {
    setFilter("actions",
      filters.actions.includes(action)
        ? filters.actions.filter((a) => a !== action)
        : [...filters.actions, action],
    );
  }, [filters.actions, setFilter]);

  useEffect(() => {
    if (!expanded && unreadCount > 0) {
    }
  }, [unreadCount, expanded]);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg">
      <button
        type="button"
        onClick={() => { setExpanded(!expanded); if (expanded) markAllRead(); }}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition"
      >
        <span className="flex items-center gap-2">
          Admin Activity
          {unreadCount > 0 && !expanded && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-black">
              {unreadCount}
            </span>
          )}
        </span>
        <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-700">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-zinc-700/50">
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${paused ? "bg-amber-600 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              type="button"
              onClick={markAllRead}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
            >
              Clear filters
            </button>
            <input
              type="text"
              placeholder="Search…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="ml-auto w-40 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 placeholder-zinc-500"
            />
          </div>

          <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-zinc-700/50">
            {actionTypes.slice(0, 8).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => handleFilterAction(action)}
                className={`rounded px-2 py-0.5 text-xs font-mono transition ${filters.actions.includes(action) ? "bg-zinc-600 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}
              >
                {action}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="max-h-96 overflow-y-auto p-4 space-y-2">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-zinc-500 py-8">No activity yet</p>
            )}
            {filtered.slice(0, 200).map((entry) => (
              <ActivityItem key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
