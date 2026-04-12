import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import { usePipelineViewQuery, usePipelineMetricsQuery } from '@/hooks/use-pipeline-query'
import PipelineColumn from '@/components/pipeline/PipelineColumn'
import PipelineMetrics from '@/components/pipeline/PipelineMetrics'

export default function PipelinePage() {
  const { data: pipelineData, isLoading, error } = usePipelineViewQuery()
  const { data: metrics } = usePipelineMetricsQuery()
  const [selectedLead, setSelectedLead] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div className="flex justify-center p-8 text-muted-foreground">Loading pipeline…</div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center p-8 text-destructive">Error loading pipeline</div>
    )
  }

  if (!pipelineData) {
    return (
      <div className="flex justify-center p-8 text-muted-foreground">No pipeline data available</div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Lead Pipeline</h1>
            <p className="text-muted-foreground">
              Tap a card → one primary next step (legacy rules). Expand “Other steps” if your role allows more.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="text-sm">
              {pipelineData.user_role.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="mb-8">
          <PipelineMetrics metrics={metrics} />
        </div>
      )}

      {/* Pipeline Columns */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pipelineData.columns.map((status) => {
          const leads = pipelineData.leads_by_status[status] || []
          const statusLabel = pipelineData.status_labels[status] || status

          return (
            <PipelineColumn
              key={status}
              status={status}
              statusLabel={statusLabel}
              leads={leads}
              selectedLead={selectedLead}
              onSelectLead={setSelectedLead}
            />
          )
        })}
      </div>

      {/* Empty State */}
      {pipelineData.total_leads === 0 && (
        <div className="py-12 text-center">
          <Users className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium text-foreground">No leads in pipeline</h3>
          <p className="text-muted-foreground">
            Start adding leads to see them in the pipeline view.
          </p>
        </div>
      )}
    </div>
  )
}
