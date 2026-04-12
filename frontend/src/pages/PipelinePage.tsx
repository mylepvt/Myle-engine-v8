import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users } from 'lucide-react'
import {
  usePipelineViewQuery,
  usePipelineMetricsQuery,
  useTransitionLeadMutation,
} from '@/hooks/use-pipeline-query'
import PipelineColumn from '@/components/pipeline/PipelineColumn'
import PipelineMetrics from '@/components/pipeline/PipelineMetrics'

export default function PipelinePage() {
  const { data: pipelineData, isLoading, error } = usePipelineViewQuery()
  const { data: metrics } = usePipelineMetricsQuery()
  const transitionMutation = useTransitionLeadMutation()
  const [selectedLead, setSelectedLead] = useState<number | null>(null)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const handleStatusTransition = async (leadId: number, newStatus: string) => {
    setTransitionError(null)
    try {
      await transitionMutation.mutateAsync({ leadId, targetStatus: newStatus })
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Failed to move lead. Please try again.')
    }
  }

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
              Manage leads through the conversion funnel
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="text-sm">
              {pipelineData.user_role.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Transition error */}
      {transitionError ? (
        <Alert className="mb-6 border-destructive/40 bg-destructive/10 text-destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{transitionError}</span>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setTransitionError(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Metrics Overview */}
      {metrics && (
        <div className="mb-8">
          <PipelineMetrics metrics={metrics} />
        </div>
      )}

      {/* Pipeline Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {pipelineData.columns.map((status) => {
          const leads = pipelineData.leads_by_status[status] || []
          const statusLabel = pipelineData.status_labels[status] || status
          
          return (
            <PipelineColumn
              key={status}
              status={status}
              statusLabel={statusLabel}
              leads={leads}
              onStatusTransition={handleStatusTransition}
              selectedLead={selectedLead}
              onSelectLead={setSelectedLead}
              userRole={pipelineData.user_role}
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
