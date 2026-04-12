import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Users, RefreshCw, Search, Filter, X } from 'lucide-react'
import { 
  usePipelineViewQuery, 
  usePipelineMetricsQuery,
  useTransitionLeadMutation,
  useAutoExpireMutation,
} from '@/hooks/use-pipeline-query'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import PipelineColumn from '@/components/pipeline/PipelineColumn'
import PipelineMetrics from '@/components/pipeline/PipelineMetrics'

export default function PipelinePage() {
  const { data: pipelineData, isLoading, error } = usePipelineViewQuery()
  const { data: metrics } = usePipelineMetricsQuery()
  const { data: authData } = useAuthMeQuery()
  const transitionMutation = useTransitionLeadMutation()
  const autoExpireMutation = useAutoExpireMutation()

  const [selectedLead, setSelectedLead] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const handleStatusTransition = async (leadId: number, newStatus: string) => {
    try {
      await transitionMutation.mutateAsync({ leadId, targetStatus: newStatus })
      setSelectedLead(null)
    } catch (error) {
      console.error('Failed to transition lead:', error)
    }
  }

  const handleAutoExpire = async () => {
    try {
      const result = await autoExpireMutation.mutateAsync()
      if (result?.expired_count > 0) {
        // Show success message or notification here if needed
        console.log(`Successfully expired ${result.expired_count} leads`)
      }
    } catch (error) {
      console.error('Failed to auto-expire leads:', error)
    }
  }

  // Filter and search logic
  const filteredData = useMemo(() => {
    if (!pipelineData) return null
    
    const filteredLeads = { ...pipelineData.leads_by_status }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      Object.keys(filteredLeads).forEach(status => {
        filteredLeads[status] = filteredLeads[status].filter(lead => 
          lead.name.toLowerCase().includes(query) ||
          (lead.email && lead.email.toLowerCase().includes(query)) ||
          (lead.phone && lead.phone.includes(query))
        )
      })
    }
    
    // Apply status filter
    if (filterStatus !== 'all') {
      Object.keys(filteredLeads).forEach(status => {
        if (status !== filterStatus) {
          filteredLeads[status] = []
        }
      })
    }
    
    return {
      ...pipelineData,
      leads_by_status: filteredLeads,
      total_leads: Object.values(filteredLeads).reduce((sum, leads) => sum + leads.length, 0)
    }
  }, [pipelineData, searchQuery, filterStatus])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Loading pipeline...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="text-red-600 text-center">
          <p className="font-medium">Error loading pipeline</p>
          <p className="text-sm mt-1">Please try refreshing the page</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh
        </Button>
      </div>
    )
  }

  if (!pipelineData) {
    return <div className="flex justify-center p-8">No pipeline data available</div>
  }

  const isAdminOrLeader = authData?.role === 'admin' || authData?.role === 'leader'

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-full xl:max-w-[1600px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Lead Pipeline</h1>
              <p className="text-gray-600">
                Manage leads through the conversion funnel
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {isAdminOrLeader && (
                <Button 
                  onClick={handleAutoExpire}
                  disabled={autoExpireMutation.isPending}
                  variant="outline"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${autoExpireMutation.isPending ? 'animate-spin' : ''}`} />
                  Auto-Expire
                </Button>
              )}
              <Badge variant="outline" className="text-sm">
                {pipelineData.user_role.toUpperCase()}
              </Badge>
            </div>
          </div>
          
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search leads by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {(filterStatus !== 'all' || searchQuery) && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    1
                  </Badge>
                )}
              </Button>
            </div>
          </div>
          
          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status Filter
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="all">All Statuses</option>
                    {pipelineData.columns.map((status) => (
                      <option key={status} value={status}>
                        {pipelineData.status_labels[status] || status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterStatus('all')
                    setSearchQuery('')
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="mb-6 lg:mb-8">
          <PipelineMetrics metrics={metrics} />
        </div>
      )}

      {/* Pipeline Columns */}
      {filteredData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6">
          {filteredData.columns.map((status) => {
            const leads = filteredData.leads_by_status[status] || []
            const statusLabel = filteredData.status_labels[status] || status
            
            return (
              <PipelineColumn
                key={status}
                status={status}
                statusLabel={statusLabel}
                leads={leads}
                onStatusTransition={handleStatusTransition}
                selectedLead={selectedLead}
                onSelectLead={setSelectedLead}
                isLoading={transitionMutation.isPending}
              />
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredData?.total_leads === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery || filterStatus !== 'all' ? 'No leads match your filters' : 'No leads in pipeline'}
          </h3>
          <p className="text-gray-600">
            {searchQuery || filterStatus !== 'all' 
              ? 'Try adjusting your search or filters to see more results.'
              : 'Start adding leads to see them in the pipeline view.'
            }
          </p>
          {(searchQuery || filterStatus !== 'all') && (
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => {
                setSearchQuery('')
                setFilterStatus('all')
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
