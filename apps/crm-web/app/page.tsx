import { FunnelShell } from "@/components/funnel-shell";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Lead Execution CRM</h1>
        <p className="text-sm text-neutral-600">Mobile-first · Button actions · Realtime</p>
      </header>
      <FunnelShell />
    </main>
  );
}
