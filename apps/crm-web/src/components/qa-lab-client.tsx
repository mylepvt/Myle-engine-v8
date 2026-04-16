"use client";

import { useCallback, useMemo, useState } from "react";
import {
  qaFetch,
  fetchBootstrap,
  type BootstrapPayload,
} from "@/lib/qa-runner";

type LogLine = { t: string; ok: boolean; msg: string; detail?: string };

const DEFAULT_POOL_PRICE_CENTS = 19600;

function pickUser(b: BootstrapPayload | null, role: string, emailSub: string) {
  return b?.users.find((u) => u.role === role && u.email.includes(emailSub));
}

function makeCtx(b: BootstrapPayload) {
  return {
    leader: pickUser(b, "leader", "qa-leader"),
    t1: pickUser(b, "team", "qa-t1"),
    t2: pickUser(b, "team", "qa-t2"),
    t3: pickUser(b, "team", "qa-t3"),
    leadFsm: b.leads.find((l) => l.name === "QA FSM Bad"),
    leadReassign: b.leads.find((l) => l.name === "QA Reassign"),
    leadClose: b.leads.find((l) => l.name === "QA Close Me"),
    pool: b.leads.filter((l) => l.inPool),
  };
}

export function QaLabClient() {
  const [apiBase, setApiBase] = useState(
    process.env.NEXT_PUBLIC_CRM_API_URL ?? "http://127.0.0.1:4000",
  );
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  const log = useCallback((ok: boolean, msg: string, detail?: string) => {
    setLogs((prev) => [
      ...prev,
      { t: new Date().toISOString().slice(11, 23), ok, msg, detail },
    ]);
  }, []);

  const loadBootstrap = useCallback(async () => {
    const b = await fetchBootstrap(apiBase);
    setBootstrap(b);
    if (b) log(true, `Bootstrap: ${b.users.length} users, ${b.leads.length} QA leads`);
    else log(false, "Bootstrap failed — is crm-api running with CRM_QA_LAB=true?");
  }, [apiBase, log]);

  const ids = useMemo(() => (bootstrap ? makeCtx(bootstrap) : null), [bootstrap]);

  const runWrongStage = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.t1 || !ctx.leadFsm) {
        log(false, "Need QA FSM Bad lead + qa-t1 in bootstrap");
        return;
      }
      const v = ctx.leadFsm.stageVersion;
      const r = await qaFetch(
        apiBase,
        `/leads/${ctx.leadFsm.id}/transition`,
        ctx.t1.id,
        "team",
        {
          method: "POST",
          body: JSON.stringify({ event: "DAY1_DONE", expectedVersion: v }),
        },
      );
      const pass = !r.ok;
      log(
        pass,
        pass
          ? "Wrong FSM rejected (expected)"
          : "Expected failure for DAY1_DONE from NEW",
        r.text.slice(0, 400),
      );
    },
    [apiBase, ids, log],
  );

  const runDoubleClaim = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.t1 || ctx.pool.length < 1) {
        log(false, "Need pool lead + qa-t1");
        return;
      }
      const leadId = ctx.pool[0]!.id;
      const key = `qa_double_${leadId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
      const bal0 = await qaFetch(apiBase, "/wallet/balance", ctx.t1.id, "team");
      const b0 = (bal0.json as { balanceCents?: number })?.balanceCents ?? -1;
      const c1 = await qaFetch(apiBase, "/pool/claim", ctx.t1.id, "team", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          idempotencyKey: key,
          pipelineKind: "TEAM",
        }),
      });
      const c2 = await qaFetch(apiBase, "/pool/claim", ctx.t1.id, "team", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          idempotencyKey: key,
          pipelineKind: "TEAM",
        }),
      });
      const bal1 = await qaFetch(apiBase, "/wallet/balance", ctx.t1.id, "team");
      const b1 = (bal1.json as { balanceCents?: number })?.balanceCents ?? -1;
      const delta = b0 - b1;
      const price =
        (c1.json as { poolPriceCents?: number })?.poolPriceCents ?? DEFAULT_POOL_PRICE_CENTS;
      const oneDebitOnly = c1.ok && c2.ok && delta === price;
      log(
        oneDebitOnly,
        `Double claim: #1 ${c1.status} #2 ${c2.status} · wallet Δ ${delta}c (want single ${price}c)`,
        JSON.stringify({ b0, b1, delta, price }),
      );
      if (c1.ok && !oneDebitOnly)
        log(false, "Possible leak or wrong idempotency — second call should not debit again");
    },
    [apiBase, ids, log],
  );

  const runReassign = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.leader || !ctx.t2 || !ctx.leadReassign) {
        log(false, "Need leader, qa-t2, QA Reassign lead");
        return;
      }
      const ownerBefore = ctx.leadReassign.ownerId;
      const r = await qaFetch(
        apiBase,
        `/leads/${ctx.leadReassign.id}/reassign`,
        ctx.leader.id,
        "leader",
        {
          method: "POST",
          body: JSON.stringify({ toUserId: ctx.t2.id, reason: "qa_lab" }),
        },
      );
      const j = r.json as { handlerId?: string; ownerId?: string } | null;
      const pass = r.ok && j?.handlerId === ctx.t2.id && j?.ownerId === ownerBefore;
      log(pass, `Reassign · owner unchanged: ${pass}`, r.text.slice(0, 500));
    },
    [apiBase, ids, log],
  );

  const runClose = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.t3 || !ctx.leadClose) {
        log(false, "Need qa-t3 + QA Close Me");
        return;
      }
      if (ctx.leadClose.stage !== "DAY3_CLOSER") {
        log(false, `QA Close Me must be DAY3_CLOSER (got ${ctx.leadClose.stage}) — re-seed if already closed`);
        return;
      }
      const r = await qaFetch(apiBase, `/leads/${ctx.leadClose.id}/close`, ctx.t3.id, "team");
      const j = r.json as { stage?: string } | null;
      log(r.ok && j?.stage === "CLOSED", `Close · ${r.status}`, r.text.slice(0, 300));
    },
    [apiBase, ids, log],
  );

  const runWalletSnapshot = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.t1) return;
      const r = await qaFetch(apiBase, "/wallet/balance", ctx.t1.id, "team");
      log(r.ok, `t1 balance`, JSON.stringify(r.json));
    },
    [apiBase, ids, log],
  );

  const runRanking = useCallback(
    async (b: BootstrapPayload | null) => {
      const ctx = b ? makeCtx(b) : ids;
      if (!ctx?.t1 || !ctx.t2 || !ctx.t3) return;
      for (const uid of [ctx.t1.id, ctx.t2.id, ctx.t3.id]) {
        await qaFetch(apiBase, "/performance/recompute", uid, "team", {
          method: "POST",
          body: JSON.stringify({ pipelineKind: "TEAM" }),
        });
      }
      const s1 = await qaFetch(apiBase, "/performance/snapshots?pipelineKind=TEAM", ctx.t1.id, "team");
      log(s1.ok, "TEAM snapshots (Redis+DB pipeline via recompute)", JSON.stringify(s1.json, null, 2).slice(0, 1200));
    },
    [apiBase, ids, log],
  );

  const runAll = useCallback(async () => {
    setBusy(true);
    setLogs([]);
    try {
      const b = await fetchBootstrap(apiBase);
      setBootstrap(b);
      if (!b) {
        log(false, "Bootstrap failed — start api with CRM_QA_LAB=true and run seed:qa");
        return;
      }
      log(true, `Bootstrap: ${b.users.length} users, ${b.leads.length} leads`);
      await runWrongStage(b);
      await runWalletSnapshot(b);
      await runDoubleClaim(b);
      await runRanking(b);
      await runReassign(b);
      await runClose(b);
      log(true, "— Run-all finished —");
    } finally {
      setBusy(false);
    }
  }, [apiBase, log, runWrongStage, runWalletSnapshot, runDoubleClaim, runRanking, runReassign, runClose]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 font-sans text-zinc-100">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">QA Lab — live API checks</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Terminal: <code className="rounded bg-zinc-800 px-1">CRM_QA_LAB=true npm run dev</code> in{" "}
          <code className="rounded bg-zinc-800 px-1">apps/crm-api</code> ·{" "}
          <code className="rounded bg-zinc-800 px-1">npm run seed:qa</code> · open this page in the browser (
          <code className="rounded bg-zinc-800 px-1">npm run dev</code> in apps/crm-web → /qa).
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          API base
          <input
            className="w-72 rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
          onClick={() => void loadBootstrap()}
          disabled={busy}
        >
          Load bootstrap
        </button>
        <button
          type="button"
          className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
          onClick={() => void runAll()}
          disabled={busy}
        >
          Run all scenarios
        </button>
      </div>

      {bootstrap && (
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-sm">
          <h2 className="mb-2 font-medium text-zinc-300">Handler load (TEAM, not in pool)</h2>
          <ul className="grid gap-1 font-mono text-xs text-zinc-400">
            {bootstrap.handlerLoad.map((h) => (
              <li key={h.handlerId ?? "none"}>
                {h.handlerId ?? "—"} → {h.activeLeads} active leads
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            Reassign target = Top‑10 Redis score ∩ team, then least-loaded handler — high counts here ≈
            overload risk.
          </p>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runWrongStage(null)}
          disabled={busy}
        >
          Break: wrong FSM
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runDoubleClaim(null)}
          disabled={busy}
        >
          Break: double claim
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runWalletSnapshot(null)}
          disabled={busy}
        >
          Wallet balance
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runRanking(null)}
          disabled={busy}
        >
          Recompute + snapshots
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runReassign(null)}
          disabled={busy}
        >
          Reassign (leader)
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
          onClick={() => void runClose(null)}
          disabled={busy}
        >
          Close (handler t3)
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Log</h2>
        <div className="max-h-[480px] overflow-auto rounded border border-zinc-700 bg-black/40 p-3 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <span className="text-zinc-500">No runs yet.</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="mb-2 border-b border-zinc-800 pb-2">
                <span className={l.ok ? "text-emerald-400" : "text-red-400"}>
                  [{l.t}] {l.ok ? "PASS" : "FAIL"}
                </span>{" "}
                {l.msg}
                {l.detail && (
                  <pre className="mt-1 whitespace-pre-wrap text-zinc-500">{l.detail}</pre>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
