import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { LiveFunnelColumn } from './LiveFunnelColumn'
import { PeopleOpsPanel } from './PeopleOpsPanel'
import { OpsKpiBar } from './OpsKpiBar'

export function LiveOpsDashboard() {
  useStageCounts()

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile: stacked. Desktop lg+: 60/40 flex split — funnel left, people ops right */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

        {/* LEFT — Live Pipeline Funnel — 50% */}
        <div className="min-w-0 flex-1 overflow-hidden rounded border border-white/[0.06] bg-[#0d0f12]">
          <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-3">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/40">
              Live Pipeline
            </h2>
            <span className="ml-auto text-[10px] font-medium text-emerald-400/60">Live</span>
          </div>
          <LiveFunnelColumn />
        </div>

        {/* RIGHT — People Operations — 50% */}
        <div className="min-w-0 flex-1 overflow-hidden lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
          <PeopleOpsPanel />
        </div>
      </div>

      {/* BOTTOM — Operational KPIs */}
      <OpsKpiBar />
    </div>
  )
}
