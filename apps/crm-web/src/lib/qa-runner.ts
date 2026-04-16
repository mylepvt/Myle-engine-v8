/** Browser-side QA harness — calls crm-api with dev headers (`x-user-id` / `x-user-role`). */

export type QaFetchResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
};

export async function qaFetch(
  apiBase: string,
  path: string,
  userId: string,
  role: string,
  init?: RequestInit,
): Promise<QaFetchResult> {
  const url = `${apiBase.replace(/\/$/, "")}/api/v1${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
      "x-user-role": role,
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, text };
}

export type BootstrapPayload = {
  users: Array<{ id: string; email: string; role: string; name: string | null }>;
  leads: Array<{
    id: string;
    name: string;
    stage: string;
    inPool: boolean;
    handlerId: string | null;
    ownerId: string;
    stageVersion: number;
  }>;
  handlerLoad: Array<{ handlerId: string | null; activeLeads: number }>;
};

export async function fetchBootstrap(apiBase: string): Promise<BootstrapPayload | null> {
  const r = await fetch(`${apiBase.replace(/\/$/, "")}/api/v1/qa/bootstrap`);
  if (!r.ok) return null;
  return r.json() as Promise<BootstrapPayload>;
}
