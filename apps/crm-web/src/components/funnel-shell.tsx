"use client";

import { useQuery } from "@tanstack/react-query";
import { useUiStore } from "@/stores/ui-store";
import { useCrmSocket } from "@/hooks/use-crm-socket";

const API = process.env.NEXT_PUBLIC_CRM_API_URL ?? "http://127.0.0.1:4000";

export function FunnelShell() {
  useCrmSocket(true);
  const { activeStep, setActiveStep } = useUiStore();
  const health = useQuery({
    queryKey: ["crm-health"],
    queryFn: async () => {
      const r = await fetch(`${API}/health`);
      if (!r.ok) throw new Error("Service unavailable");
      return r.json() as Promise<{ ok: boolean; service: string }>;
    },
  });

  const stages = [
    "New",
    "Invited",
    "WhatsApp",
    "Video",
    "Paid ₹196",
    "Mindset lock",
    "Day 1",
    "Day 2",
    "Day 3",
    "Closed",
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">System Status</p>
        {health.isLoading && <p className="text-sm">Checking…</p>}
        {health.isError && <p className="text-sm text-red-600">Service temporarily unavailable. Please try again.</p>}
        {health.data && (
          <p className="text-sm text-emerald-700">
            {health.data.service} · {health.data.ok ? "Online" : "Limited"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {stages.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveStep(s)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeStep === s
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Current stage: <span className="font-mono">{activeStep}</span>
      </p>
    </section>
  );
}
