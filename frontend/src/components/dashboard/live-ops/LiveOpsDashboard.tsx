import { useStageCounts } from '@/hooks/use-stage-counts-query'
import { LiveFunnelColumn } from './LiveFunnelColumn'
import { PeopleOpsPanel } from './PeopleOpsPanel'
import { OpsKpiBar } from './OpsKpiBar'

export function LiveOpsDashboard() {
  useStageCounts()

  return (
    <div className="flex flex-col gap-4">
      {/*
        Mobile:  funnel full width, people ops stacked below
        Desktop (lg+): side-by-side — funnel left, people ops right
      */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

        {/* LEFT — Live Pipeline Funnel (always visible) */}
        <div className="min-w-0 flex-1 overflow-hidden rounded border border-white/[0.06] bg-card">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 sm:text-[12px]">
              Live Pipeline
            </h2>
            <span className="ml-auto text-[10px] font-medium text-emerald-400/70">Live</span>
          </div>
          <LiveFunnelColumn />
        </div>

        {/* RIGHT — People Operations (full width on mobile, 420px on desktop) */}
        <div className="w-full overflow-hidden lg:w-[420px] lg:shrink-0 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
          <PeopleOpsPanel />
        </div>
      </div>

      {/* BOTTOM — Operational KPIs */}
      <OpsKpiBar />
    </div>
  )
}
