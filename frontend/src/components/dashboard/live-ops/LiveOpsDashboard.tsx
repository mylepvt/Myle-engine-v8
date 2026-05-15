import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { LiveFunnelColumn } from './LiveFunnelColumn'
import { PeopleOpsPanel } from './PeopleOpsPanel'
import { OpsKpiBar } from './OpsKpiBar'

export function LiveOpsDashboard() {
  // Pre-fetch stage counts so both columns have data
  useStageCounts()

  return (
    <div className="flex flex-col gap-4">
      {/* Main two-column layout */}
      <div className="flex gap-4">
        {/* LEFT — Live Pipeline Funnel */}
        <div className="flex-1 min-w-0 rounded border border-white/[0.06] bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Live Pipeline
            </h2>
            <span className="ml-auto text-[10px] font-medium text-emerald-400/70">Live</span>
          </div>
          <LiveFunnelColumn />
        </div>

        {/* RIGHT — People Operations */}
        <div className="w-[420px] shrink-0 overflow-y-auto max-h-[calc(100vh-14rem)]">
          <PeopleOpsPanel />
        </div>
      </div>

      {/* BOTTOM — Operational KPIs */}
      <OpsKpiBar />
    </div>
  )
}
